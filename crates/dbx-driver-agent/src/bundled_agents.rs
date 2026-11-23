//! Drivers compiled into the executable.
//!
//! Only the drivers this build actually ships are embedded: Oracle (thin + OCI),
//! KingbaseES and Dameng. They are extracted into the same managed directory
//! the driver store uses, so the rest of the application keeps treating them as
//! ordinary installed drivers (no network, no first-run download).
//!
//! Release archives keep their published file names (`dbx-agent-*` for native
//! agents, `agent.jar` for Java ones) and may carry an `agent-registry.json`;
//! the managed layout, however, requires exactly `agent.exe` / `agent.jar`.
//! The archive is therefore unpacked into a staging directory and only the
//! agent artifact is moved into place.
//!
//! Extraction is idempotent: a driver that already has `agent.exe`/`agent.jar`
//! is left untouched, which keeps user-updated copies and makes repeated
//! startup a no-op.

use std::io::Cursor;
use std::path::{Component, Path, PathBuf};

use crate::agent_manager::{AgentManager, InstalledDriver};

struct BundledDriver {
    key: &'static str,
    version: &'static str,
    jre: &'static str,
    archive: &'static [u8],
}

static BUNDLED_DRIVERS: &[BundledDriver] = &[
    BundledDriver {
        key: "oracle",
        version: "0.1.81",
        jre: "21",
        archive: include_bytes!("../assets/bundled/dbx-agent-oracle-0.1.81-windows-x64.tar.zst"),
    },
    BundledDriver {
        key: "oracle-oci",
        version: "0.1.14",
        jre: "21",
        archive: include_bytes!("../assets/bundled/dbx-agent-oracle-oci-0.1.14-windows-x64.tar.zst"),
    },
    BundledDriver {
        key: "kingbase",
        version: "0.1.72",
        jre: "21",
        archive: include_bytes!("../assets/bundled/dbx-agent-kingbase-0.1.72-windows-x64.tar.zst"),
    },
    BundledDriver {
        key: "dameng",
        version: "0.1.105",
        jre: "21",
        archive: include_bytes!("../assets/bundled/dbx-agent-dameng-0.1.105.tar.zst"),
    },
];

const STAGING_DIR: &str = ".dbx-unpack";

fn native_agent_name() -> &'static str {
    if cfg!(windows) {
        "agent.exe"
    } else {
        "agent"
    }
}

fn driver_entry(dir: &Path) -> PathBuf {
    let native = dir.join(native_agent_name());
    if native.is_file() {
        return native;
    }
    dir.join("agent.jar")
}

/// Extracts every bundled driver that is not installed yet. Errors are
/// returned rather than panicking: a broken extraction must not block startup,
/// the driver store can still install the same driver from the network.
pub fn install_bundled_drivers(manager: &AgentManager) -> Result<(), String> {
    let mut state = manager.load_state();
    let mut changed = false;

    for driver in BUNDLED_DRIVERS {
        let dir = manager.driver_dir(driver.key);
        if driver_entry(&dir).is_file() {
            continue;
        }
        install_payload(driver.archive, &dir)
            .map_err(|error| format!("failed to install bundled {} driver: {error}", driver.key))?;

        if !driver_entry(&dir).is_file() {
            return Err(format!("bundled {} driver archive did not contain an agent binary", driver.key));
        }

        state.installed_drivers.insert(
            driver.key.to_string(),
            InstalledDriver {
                version: driver.version.to_string(),
                installed_at: chrono::Utc::now().to_rfc3339(),
                jre: driver.jre.to_string(),
            },
        );
        changed = true;
    }

    if changed {
        manager.save_state(&state)?;
    }
    Ok(())
}

/// Unpacks the archive into a staging directory, then moves the agent artifact
/// (and any `libs/` beside a jar) into the managed layout.
fn install_payload(archive_bytes: &[u8], dir: &Path) -> Result<(), String> {
    std::fs::create_dir_all(dir).map_err(|error| format!("failed to create {}: {error}", dir.display()))?;

    let staging = dir.join(STAGING_DIR);
    if staging.exists() {
        std::fs::remove_dir_all(&staging).ok();
    }
    std::fs::create_dir_all(&staging).map_err(|error| format!("failed to create {}: {error}", staging.display()))?;

    extract_archive(archive_bytes, &staging)?;

    let agent = find_agent(&staging).ok_or_else(|| "archive contains no agent.exe or agent.jar".to_string())?;
    let target = dir.join(if agent.extension().and_then(|ext| ext.to_str()) == Some("jar") {
        "agent.jar"
    } else {
        native_agent_name()
    });

    move_path(&agent, &target)?;
    // Java agents may ship helper jars in a sibling `libs/` directory.
    if let Some(parent) = agent.parent() {
        if parent != staging {
            copy_dir_contents(parent, dir)?;
        }
    }

    std::fs::remove_dir_all(&staging).ok();
    remove_stale_entries(dir, &target);
    Ok(())
}

/// Prefer a file literally named `agent.exe`/`agent.jar`, then any executable
/// with the expected extension (release artifacts are named after the product).
fn find_agent(root: &Path) -> Option<PathBuf> {
    let preferred = [native_agent_name(), "agent.jar"];
    for name in preferred {
        if let Some(found) = find_named(root, name) {
            return Some(found);
        }
    }
    find_by_extension(root, "exe").or_else(|| find_by_extension(root, "jar"))
}

fn find_named(root: &Path, name: &str) -> Option<PathBuf> {
    let direct = root.join(name);
    if direct.is_file() {
        return Some(direct);
    }
    let entries = std::fs::read_dir(root).ok()?;
    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_dir() {
            if let Some(found) = find_named(&path, name) {
                return Some(found);
            }
        } else if path.file_name().and_then(|value| value.to_str()) == Some(name) {
            return Some(path);
        }
    }
    None
}

fn find_by_extension(root: &Path, extension: &str) -> Option<PathBuf> {
    let entries = std::fs::read_dir(root).ok()?;
    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_dir() {
            if let Some(found) = find_by_extension(&path, extension) {
                return Some(found);
            }
        } else if path.extension().and_then(|value| value.to_str()).is_some_and(|ext| ext.eq_ignore_ascii_case(extension))
        {
            return Some(path);
        }
    }
    None
}

fn move_path(from: &Path, to: &Path) -> Result<(), String> {
    if to.exists() {
        std::fs::remove_file(to).ok();
    }
    std::fs::rename(from, to).or_else(|_| {
        std::fs::copy(from, to).map(|_| ()).and_then(|_| std::fs::remove_file(from))
    })
    .map_err(|error| format!("failed to move {} to {}: {error}", from.display(), to.display()))
}

fn copy_dir_contents(from: &Path, to: &Path) -> Result<(), String> {
    let entries = std::fs::read_dir(from).map_err(|error| format!("failed to read {}: {error}", from.display()))?;
    for entry in entries.flatten() {
        let source = entry.path();
        let target = to.join(entry.file_name());
        if source.is_dir() {
            std::fs::create_dir_all(&target).map_err(|error| format!("failed to create {}: {error}", target.display()))?;
            copy_dir_contents(&source, &target)?;
        } else if !target.exists() {
            std::fs::copy(&source, &target)
                .map_err(|error| format!("failed to copy {}: {error}", source.display()))?;
        }
    }
    Ok(())
}

/// Drops leftovers from earlier layouts (release-named binaries, the extracted
/// registry manifest) so the managed directory only holds the agent.
fn remove_stale_entries(dir: &Path, keep: &Path) {
    let Ok(entries) = std::fs::read_dir(dir) else {
        return;
    };
    for entry in entries.flatten() {
        let path = entry.path();
        if path == keep || path.file_name().and_then(|value| value.to_str()) == Some("libs") {
            continue;
        }
        if path.is_dir() {
            std::fs::remove_dir_all(&path).ok();
        } else {
            std::fs::remove_file(&path).ok();
        }
    }
}

/// Unpacks a tar.zst payload into `dir`, dropping the leading `drivers/`
/// directory that release archives wrap their payload in.
fn extract_archive(archive_bytes: &[u8], dir: &Path) -> Result<(), String> {
    let decoder = zstd::stream::read::Decoder::new(Cursor::new(archive_bytes))
        .map_err(|error| format!("failed to open bundled zstd archive: {error}"))?;
    let mut archive = tar::Archive::new(decoder);
    let entries = archive
        .entries()
        .map_err(|error| format!("invalid bundled tar archive: {error}"))?;

    for entry in entries {
        let mut entry = entry.map_err(|error| format!("invalid bundled tar entry: {error}"))?;
        if !entry.header().entry_type().is_file() {
            continue;
        }
        let path = entry.path().map_err(|error| format!("invalid bundled entry path: {error}"))?;
        let Some(relative) = relative_entry_path(&path) else {
            continue;
        };
        let target = dir.join(&relative);
        if let Some(parent) = target.parent() {
            std::fs::create_dir_all(parent)
                .map_err(|error| format!("failed to create {}: {error}", parent.display()))?;
        }
        let mut file = std::fs::File::create(&target)
            .map_err(|error| format!("failed to create {}: {error}", target.display()))?;
        std::io::copy(&mut entry, &mut file)
            .map_err(|error| format!("failed to write {}: {error}", target.display()))?;
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_dir(label: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("dbx-bundled-{label}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        dir
    }

    #[test]
    fn native_payload_installs_as_agent_exe() {
        let dir = temp_dir("single-oracle");
        install_payload(BUNDLED_DRIVERS[0].archive, &dir).unwrap();

        let exe = dir.join(native_agent_name());
        assert!(exe.is_file(), "agent binary must be renamed to {}", native_agent_name());
        assert!(
            std::fs::metadata(&exe).unwrap().len() > 10 * 1024 * 1024,
            "agent binary was not decompressed"
        );
        assert!(!dir.join("agent-registry.json").exists(), "release manifest must not be installed");
        assert_eq!(std::fs::read_dir(&dir).unwrap().flatten().count(), 1, "only the agent may remain");

        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn java_payload_installs_as_agent_jar() {
        let dir = temp_dir("single-dameng");
        install_payload(BUNDLED_DRIVERS[3].archive, &dir).unwrap();

        assert!(dir.join("agent.jar").is_file(), "jar must be renamed to agent.jar");
        assert!(!dir.join("agent-registry.json").exists());
        assert_eq!(std::fs::read_dir(&dir).unwrap().flatten().count(), 1, "only the agent may remain");

        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn every_bundled_driver_installs() {
        for driver in BUNDLED_DRIVERS {
            let dir = temp_dir(&format!("all-{}", driver.key));
            install_payload(driver.archive, &dir).unwrap();
            assert!(driver_entry(&dir).is_file(), "{} did not install", driver.key);
            std::fs::remove_dir_all(&dir).ok();
        }
    }
}

/// Strips the release wrapper (`drivers/`, `dbx-jre/`, `./`) and rejects
/// absolute or parent-traversing paths.
fn relative_entry_path(path: &Path) -> Option<PathBuf> {
    let mut components: Vec<&str> = Vec::new();
    for component in path.components() {
        match component {
            Component::Normal(value) => components.push(value.to_str()?),
            Component::CurDir => {}
            _ => return None,
        }
    }
    if components.first() == Some(&"drivers") {
        components.remove(0);
    }
    if components.is_empty() {
        return None;
    }
    Some(components.iter().collect())
}
