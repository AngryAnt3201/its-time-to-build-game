use std::path::Path;
use tokio::process::Command;
use tracing::info;

/// Scaffold a new Vite React-TS project inside `dir`.
///
/// 1. Create the directory if it does not exist.
/// 2. If `package.json` already exists, skip scaffolding (idempotent).
/// 3. Run `npm create vite@latest . -- --template react-ts`.
/// 4. Run `npm install`.
/// 5. Write a README.md with the building name and description.
pub async fn scaffold_project(
    dir: &Path,
    name: &str,
    description: &str,
) -> Result<String, String> {
    // 1. Create directory
    if !dir.exists() {
        tokio::fs::create_dir_all(dir)
            .await
            .map_err(|e| format!("Failed to create directory {}: {}", dir.display(), e))?;
    }

    // 2. Check for existing package.json (idempotent)
    let package_json = dir.join("package.json");
    if package_json.exists() {
        info!("{}: already scaffolded, skipping", name);
        return Ok(format!("{}: already scaffolded", name));
    }

    info!("Scaffolding project: {} in {}", name, dir.display());

    // 3. Run npm create vite@latest
    let vite_output = Command::new("npm")
        .args([
            "create",
            "vite@latest",
            ".",
            "--",
            "--template",
            "react-ts",
        ])
        .current_dir(dir)
        .output()
        .await
        .map_err(|e| format!("Failed to run npm create vite for {}: {}", name, e))?;

    if !vite_output.status.success() {
        let stderr = String::from_utf8_lossy(&vite_output.stderr);
        return Err(format!("npm create vite failed for {}: {}", name, stderr));
    }

    // 4. Run npm install
    let install_output = Command::new("npm")
        .args(["install"])
        .current_dir(dir)
        .output()
        .await
        .map_err(|e| format!("Failed to run npm install for {}: {}", name, e))?;

    if !install_output.status.success() {
        let stderr = String::from_utf8_lossy(&install_output.stderr);
        return Err(format!("npm install failed for {}: {}", name, stderr));
    }

    // 5. Write README.md
    let readme_content = format!("# {}\n\n{}\n", name, description);
    tokio::fs::write(dir.join("README.md"), readme_content)
        .await
        .map_err(|e| format!("Failed to write README for {}: {}", name, e))?;

    info!("Successfully scaffolded project: {}", name);
    Ok(format!("{}: scaffolded successfully", name))
}
