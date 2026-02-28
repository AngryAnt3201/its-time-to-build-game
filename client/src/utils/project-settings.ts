const PROJECT_DIR_KEY = "project_base_dir";
const PROJECT_INIT_FLAG = "project_should_init";

export function getProjectDir(): string | null {
  return localStorage.getItem(PROJECT_DIR_KEY);
}

export function setProjectDir(dir: string): void {
  localStorage.setItem(PROJECT_DIR_KEY, dir);
}

export function getProjectInitFlag(): boolean {
  return localStorage.getItem(PROJECT_INIT_FLAG) === "true";
}

export function setProjectInitFlag(value: boolean): void {
  if (value) {
    localStorage.setItem(PROJECT_INIT_FLAG, "true");
  } else {
    localStorage.removeItem(PROJECT_INIT_FLAG);
  }
}

/** Open the native directory picker via the server HTTP API. Returns the selected path or null. */
export async function browseForDirectory(): Promise<string | null> {
  try {
    const res = await fetch("http://127.0.0.1:9002/api/browse-directory", { method: "POST" });
    const data = await res.json();
    return data.path ?? null;
  } catch {
    return null;
  }
}

/** Returns true if a project directory has been configured. */
export function isProjectReady(): boolean {
  const dir = getProjectDir();
  return !!dir && dir.length > 0;
}
