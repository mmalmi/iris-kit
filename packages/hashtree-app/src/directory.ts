import {
  DEFAULT_IGNORE_PATTERNS,
  filterByGitignore,
  parseGitignore,
  type GitignorePattern,
} from './gitignore';

export interface FileWithPath {
  file: File;
  relativePath: string;
}

export interface DirectoryReadResult {
  files: FileWithPath[];
  hasGitignore: boolean;
  gitignorePatterns: GitignorePattern[] | null;
  rootDirName: string | null;
}

export function readFilesFromWebkitDirectory(files: FileList): DirectoryReadResult {
  const result: FileWithPath[] = [];
  let gitignoreFile: File | null = null;
  let rootDirName: string | null = null;

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    if (!file) continue;

    const relativePath = (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name;

    if (!rootDirName && relativePath.includes('/')) {
      rootDirName = relativePath.split('/')[0] ?? null;
    }

    const pathParts = relativePath.split('/');
    if (pathParts.length === 2 && pathParts[1] === '.gitignore') {
      gitignoreFile = file;
    }

    result.push({ file, relativePath });
  }

  return {
    files: result,
    hasGitignore: gitignoreFile !== null,
    gitignorePatterns: null,
    rootDirName,
  };
}

export async function parseGitignoreFromFile(file: File): Promise<GitignorePattern[]> {
  const content = await file.text();
  return parseGitignore(content);
}

export function findGitignoreFile(files: FileWithPath[], rootDirName: string | null): FileWithPath | null {
  return files.find((file) => {
    const parts = file.relativePath.split('/');
    if (rootDirName) {
      return parts.length === 2 && parts[0] === rootDirName && parts[1] === '.gitignore';
    }
    return parts.length === 2 && parts[1] === '.gitignore';
  }) || null;
}

export function applyGitignoreFilter(
  files: FileWithPath[],
  patterns: GitignorePattern[],
  includeDefaults = true,
): { included: FileWithPath[]; excluded: FileWithPath[] } {
  const allPatterns = includeDefaults ? [...DEFAULT_IGNORE_PATTERNS, ...patterns] : patterns;
  return filterByGitignore(files, allPatterns);
}

export function applyDefaultIgnoreFilter(
  files: FileWithPath[],
): { included: FileWithPath[]; excluded: FileWithPath[] } {
  return filterByGitignore(files, DEFAULT_IGNORE_PATTERNS);
}

export function hasDirectoryItems(dataTransfer: DataTransfer): boolean {
  if (!dataTransfer.items) return false;

  for (let i = 0; i < dataTransfer.items.length; i++) {
    const item = dataTransfer.items[i];
    if (item?.kind === 'file') {
      const entry = item.webkitGetAsEntry?.();
      if (entry?.isDirectory) return true;
    }
  }

  return false;
}

async function readEntry(entry: FileSystemEntry, basePath: string): Promise<FileWithPath[]> {
  if (entry.isFile) {
    const fileEntry = entry as FileSystemFileEntry;
    const file = await new Promise<File>((resolve, reject) => {
      fileEntry.file(resolve, reject);
    });
    return [{ file, relativePath: basePath }];
  }

  if (entry.isDirectory) {
    const dirEntry = entry as FileSystemDirectoryEntry;
    const reader = dirEntry.createReader();
    const results: FileWithPath[] = [];

    let entries: FileSystemEntry[] = [];
    do {
      const batch = await new Promise<FileSystemEntry[]>((resolve, reject) => {
        reader.readEntries(resolve, reject);
      });
      entries = batch;

      for (const childEntry of entries) {
        const childPath = basePath ? `${basePath}/${childEntry.name}` : childEntry.name;
        const childFiles = await readEntry(childEntry, childPath);
        results.push(...childFiles);
      }
    } while (entries.length > 0);

    return results;
  }

  return [];
}

export async function readFilesFromDataTransfer(dataTransfer: DataTransfer): Promise<DirectoryReadResult> {
  const results: FileWithPath[] = [];
  let rootDirName: string | null = null;

  if (dataTransfer.items) {
    for (let i = 0; i < dataTransfer.items.length; i++) {
      const item = dataTransfer.items[i];
      if (item?.kind !== 'file') continue;

      const entry = item.webkitGetAsEntry?.();
      if (entry) {
        if (entry.isDirectory && !rootDirName) {
          rootDirName = entry.name;
        }
        const files = await readEntry(entry, entry.name);
        results.push(...files);
      } else {
        const file = item.getAsFile();
        if (file) {
          results.push({ file, relativePath: file.name });
        }
      }
    }
  } else if (dataTransfer.files) {
    for (let i = 0; i < dataTransfer.files.length; i++) {
      const file = dataTransfer.files[i];
      if (file) {
        results.push({ file, relativePath: file.name });
      }
    }
  }

  const gitignoreFileEntry = findGitignoreFile(results, rootDirName);

  return {
    files: results,
    hasGitignore: gitignoreFileEntry !== null,
    gitignorePatterns: null,
    rootDirName,
  };
}

export function supportsDirectoryUpload(): boolean {
  const input = document.createElement('input');
  return 'webkitdirectory' in input;
}
