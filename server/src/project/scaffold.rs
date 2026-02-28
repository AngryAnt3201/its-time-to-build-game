use std::path::Path;
use tokio::process::Command;
use tracing::info;

/// Scaffold a new Vite React-TS project inside `dir`.
///
/// 1. Create the directory if it does not exist.
/// 2. If `package.json` already exists, skip scaffolding (idempotent).
/// 3. Run `npm create vite@latest . -- --template react-ts`.
/// 4. Run `npm install`.
/// 5. Write themed App.tsx, App.css, index.css matching the game aesthetic.
/// 6. Write a README.md with the building name and description.
pub async fn scaffold_project(
    dir: &Path,
    name: &str,
    description: &str,
    tier: u8,
    port: u16,
) -> Result<String, String> {
    // 1. Create directory
    if !dir.exists() {
        tokio::fs::create_dir_all(dir)
            .await
            .map_err(|e| format!("Failed to create directory {}: {}", dir.display(), e))?;
    }

    // 2. Check for existing package.json — skip npm create/install but
    //    always re-write themed template files so they stay up to date.
    let package_json = dir.join("package.json");
    if package_json.exists() {
        info!("{}: npm scaffold exists, updating templates", name);
        let src_dir = dir.join("src");
        write_themed_files(&src_dir, name, description, tier, port).await?;
        return Ok(format!("{}: templates updated", name));
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

    // 5. Write themed template files
    let src_dir = dir.join("src");
    write_themed_files(&src_dir, name, description, tier, port).await?;

    // 6. Write README.md
    let readme_content = format!("# {}\n\n{}\n", name, description);
    tokio::fs::write(dir.join("README.md"), readme_content)
        .await
        .map_err(|e| format!("Failed to write README for {}: {}", name, e))?;

    info!("Successfully scaffolded project: {}", name);
    Ok(format!("{}: scaffolded successfully", name))
}

/// Overwrite the Vite boilerplate with themed files matching the game aesthetic.
async fn write_themed_files(
    src_dir: &Path,
    name: &str,
    description: &str,
    tier: u8,
    port: u16,
) -> Result<(), String> {
    let tier_label = match tier {
        1 => "TIER I",
        2 => "TIER II",
        3 => "TIER III",
        4 => "TIER IV",
        _ => "TIER ?",
    };

    // ── index.css ──────────────────────────────────────────────────────
    let index_css = r#"@import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;600;700&display=swap');

:root {
  font-family: 'IBM Plex Mono', monospace;
  font-synthesis: none;
  text-rendering: optimizeLegibility;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

html, body, #root {
  width: 100%;
  height: 100%;
  background: #0a0a0a;
  color: #c8b06b;
  overflow: hidden;
}
"#;

    // ── App.css ────────────────────────────────────────────────────────
    let app_css = r#".scaffold-container {
  width: 100vw;
  height: 100vh;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  background: #0a0a0a;
  position: relative;
  overflow: hidden;
}

/* Scanline overlay */
.scaffold-container::before {
  content: '';
  position: absolute;
  inset: 0;
  background: repeating-linear-gradient(
    to bottom,
    transparent 0px,
    transparent 3px,
    rgba(0, 0, 0, 0.06) 3px,
    rgba(0, 0, 0, 0.06) 4px
  );
  opacity: 0.4;
  pointer-events: none;
  z-index: 10;
}

/* Vignette */
.scaffold-container::after {
  content: '';
  position: absolute;
  inset: 0;
  background: radial-gradient(
    ellipse 60% 50% at 50% 50%,
    transparent 0%,
    rgba(0, 0, 0, 0.4) 70%,
    rgba(0, 0, 0, 0.85) 100%
  );
  pointer-events: none;
  z-index: 5;
}

.scaffold-content {
  position: relative;
  z-index: 20;
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  padding: 40px;
  gap: 16px;
}

.scaffold-tier {
  font-size: 0.6rem;
  font-weight: 700;
  letter-spacing: 0.35em;
  color: #6b8e23;
  text-shadow: 0 0 8px rgba(107, 142, 35, 0.4);
  text-transform: uppercase;
}

.scaffold-name {
  font-size: clamp(1.4rem, 4vw, 2.8rem);
  font-weight: 700;
  color: #f0f0f0;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  text-shadow:
    0 0 8px rgba(201, 162, 39, 0.4),
    0 0 30px rgba(201, 162, 39, 0.15);
}

.scaffold-rule {
  width: 120px;
  height: 1px;
  background: linear-gradient(
    90deg,
    transparent 0%,
    rgba(201, 162, 39, 0.4) 20%,
    #c9a227 50%,
    rgba(201, 162, 39, 0.4) 80%,
    transparent 100%
  );
  box-shadow: 0 0 8px rgba(201, 162, 39, 0.15);
}

.scaffold-description {
  font-size: 0.8rem;
  color: #c8b06b;
  opacity: 0.7;
  max-width: 480px;
  line-height: 1.6;
  letter-spacing: 0.03em;
}

.scaffold-port {
  font-size: 0.6rem;
  color: #5a4e3c;
  letter-spacing: 0.15em;
  margin-top: 4px;
}

.scaffold-status {
  margin-top: 28px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
}

.scaffold-status-text {
  font-size: 0.7rem;
  font-weight: 600;
  letter-spacing: 0.3em;
  color: #c9a227;
  text-transform: uppercase;
  animation: statusPulse 3s ease-in-out infinite;
}

@keyframes statusPulse {
  0%, 100% { opacity: 0.4; }
  50%      { opacity: 1; }
}

.scaffold-status-bar {
  width: 200px;
  height: 2px;
  background: rgba(201, 162, 39, 0.15);
  border-radius: 1px;
  overflow: hidden;
  position: relative;
}

.scaffold-status-bar::after {
  content: '';
  position: absolute;
  top: 0;
  left: -40%;
  width: 40%;
  height: 100%;
  background: linear-gradient(
    90deg,
    transparent,
    #c9a227,
    transparent
  );
  animation: statusSweep 2s ease-in-out infinite;
}

@keyframes statusSweep {
  0%   { left: -40%; }
  100% { left: 100%; }
}

.scaffold-hint {
  margin-top: 20px;
  font-size: 0.55rem;
  color: #5a4e3c;
  letter-spacing: 0.08em;
  max-width: 360px;
  line-height: 1.6;
}
"#;

    // ── App.tsx ─────────────────────────────────────────────────────────
    let app_tsx = format!(
        r#"import './App.css'

function App() {{
  return (
    <div className="scaffold-container">
      <div className="scaffold-content">
        <div className="scaffold-tier">{tier_label}</div>
        <h1 className="scaffold-name">{name}</h1>
        <div className="scaffold-rule" />
        <p className="scaffold-description">{description}</p>
        <span className="scaffold-port">PORT {port}</span>

        <div className="scaffold-status">
          <span className="scaffold-status-text">Awaiting Agent Deployment</span>
          <div className="scaffold-status-bar" />
        </div>

        <p className="scaffold-hint">
          Assign agents to this building in-game. They will write the application code for this project.
        </p>
      </div>
    </div>
  )
}}

export default App
"#,
        tier_label = tier_label,
        name = name,
        description = description,
        port = port,
    );

    // Write all three files
    tokio::fs::write(src_dir.join("index.css"), index_css)
        .await
        .map_err(|e| format!("Failed to write index.css: {}", e))?;

    tokio::fs::write(src_dir.join("App.css"), app_css)
        .await
        .map_err(|e| format!("Failed to write App.css: {}", e))?;

    tokio::fs::write(src_dir.join("App.tsx"), app_tsx)
        .await
        .map_err(|e| format!("Failed to write App.tsx: {}", e))?;

    // Remove default Vite assets that clash with our theme
    let _ = tokio::fs::remove_file(src_dir.join("App.css").with_file_name("reactlogo.svg")).await;
    let _ = tokio::fs::remove_file(src_dir.join("assets").join("react.svg")).await;

    Ok(())
}
