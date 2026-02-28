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
