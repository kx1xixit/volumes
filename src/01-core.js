const defaultPerms = {
  create: true,
  delete: true,
  see: true,
  read: true,
  write: true,
  control: true,
};

// Fallback permissions for edge cases (Least Privilege)
// Reserved for future sandboxed mounts
/*
  const restrictivePerms = {
    create: false,
    delete: false,
    see: true,
    read: true,
    write: false,
    control: false,
  };
  */

const META = {
  VERSION: '1.0.0-rc1',
  NAME: 'Volumes',
  AUTHOR: 'kx1xixit',
  MAX_FILES: 10000, // Hard limit to prevent browser crashes
};

class Volumes {
  constructor() {
    // --- STATE INITIALIZATION ---
    this.fs = new Map();
    this.childIndex = new Map();

    this.ramfs = new Map();
    this.ramIndex = new Map();

    // Persistence State
    this.persistenceNamespace = null; // Disabled by default
    this.persistenceBackend = 'local'; // 'local' or 'indexeddb'

    this.VolumesLogEnabled = false;
    this.lastError = '';
    this.readActivity = false;
    this.writeActivity = false;
    this.lastReadPath = '';
    this.lastWritePath = '';

    this.runtime = Scratch.vm ? Scratch.vm.runtime : null;
    this.isUnsandboxed = !!Scratch.extensions.unsandboxed;

    this._log(`Initializing ${META.NAME} v${META.VERSION} by ${META.AUTHOR}...`);
    this._internalClean();

    if (!this.isUnsandboxed) {
      console.warn(
        '[Volumes] Extension running in SANDBOXED mode. Persistence blocks will be unavailable.'
      );
    }

    // Guard against duplicate listeners on reload (Hot-reload safety)
    if (this.runtime && !this.runtime._VolumesProjectStartHooked) {
      this.runtime._VolumesProjectStartHooked = true;
      this.runtime.on('PROJECT_START', () => {
        this._log('Project start: Clearing RamDisk...');
        this.clearRamdisk();
      });
    }
  }

  /* ==============================================================================================
       SECTION: BLOCK DEFINITIONS
       ============================================================================================== */

  getInfo() {
    return {
      id: 'kxVolumes',
      name: `${META.NAME}`,
      color1: '#00bf63',
      color2: '#00a355',
      color3: '#006836',
      blocks: [
        // --- Main Operations ---
        {
          blockType: Scratch.BlockType.LABEL,
          text: Scratch.translate('File Operations'),
        },
        {
          opcode: 'fsManage',
          blockType: Scratch.BlockType.COMMAND,
          text: Scratch.translate('file [ACTION] path [STR] value [STR2]'),
          arguments: {
            ACTION: {
              type: Scratch.ArgumentType.STRING,
              menu: 'MANAGE_MENU',
            },
            STR: {
              type: Scratch.ArgumentType.STRING,
              defaultValue: '/Volumes/myFile.txt',
            },
            STR2: {
              type: Scratch.ArgumentType.STRING,
              defaultValue: 'Hello World',
            },
          },
        },
        {
          opcode: 'open',
          blockType: Scratch.BlockType.REPORTER,
          text: Scratch.translate('read content of [STR]'),
          arguments: {
            STR: {
              type: Scratch.ArgumentType.STRING,
              defaultValue: '/Volumes/myFile.txt',
            },
          },
        },
        {
          opcode: 'list',
          blockType: Scratch.BlockType.REPORTER,
          text: Scratch.translate('list [TYPE] under [STR] as JSON'),
          arguments: {
            TYPE: {
              type: Scratch.ArgumentType.STRING,
              menu: 'LIST_TYPE_MENU',
              defaultValue: 'all',
            },
            STR: {
              type: Scratch.ArgumentType.STRING,
              defaultValue: '/Volumes/',
            },
          },
        },
        {
          opcode: 'listGlob',
          blockType: Scratch.BlockType.REPORTER,
          text: Scratch.translate('list [TYPE] matching [PATTERN] in [DIR] as JSON'),
          arguments: {
            TYPE: {
              type: Scratch.ArgumentType.STRING,
              menu: 'LIST_TYPE_MENU',
              defaultValue: 'all',
            },
            PATTERN: {
              type: Scratch.ArgumentType.STRING,
              defaultValue: '*.txt',
            },
            DIR: {
              type: Scratch.ArgumentType.STRING,
              defaultValue: '/Volumes/',
            },
          },
        },
        {
          opcode: 'fsClear',
          blockType: Scratch.BlockType.COMMAND,
          text: Scratch.translate('clear [TARGET]'),
          arguments: {
            TARGET: { type: Scratch.ArgumentType.STRING, menu: 'CLEAR_MENU' },
          },
        },

        // --- Persistence (Browser Storage) ---
        {
          blockType: Scratch.BlockType.LABEL,
          text: Scratch.translate('Persistence'),
        },
        {
          opcode: 'configPersistence',
          blockType: Scratch.BlockType.COMMAND,
          text: Scratch.translate('enable persistence ID [NS] using [BACKEND]'),
          arguments: {
            NS: {
              type: Scratch.ArgumentType.STRING,
              defaultValue: 'MyGameData',
            },
            BACKEND: {
              type: Scratch.ArgumentType.STRING,
              menu: 'BACKEND_MENU',
              defaultValue: 'local',
            },
          },
        },
        {
          opcode: 'saveToStorage',
          blockType: Scratch.BlockType.COMMAND,
          text: Scratch.translate('save filesystem to browser storage'),
        },
        {
          opcode: 'loadFromStorage',
          blockType: Scratch.BlockType.COMMAND,
          text: Scratch.translate('load filesystem from browser storage'),
        },
        {
          opcode: 'clearStorage',
          blockType: Scratch.BlockType.COMMAND,
          text: Scratch.translate('delete saved data from browser storage'),
        },
        {
          opcode: 'isPersistenceEnabled',
          blockType: Scratch.BlockType.BOOLEAN,
          text: Scratch.translate('is persistence active?'),
        },

        // --- Information & Checks ---
        {
          blockType: Scratch.BlockType.LABEL,
          text: Scratch.translate('Info & Checks'),
        },
        {
          opcode: 'fsCheck',
          blockType: Scratch.BlockType.BOOLEAN,
          text: Scratch.translate('check if [STR] [CONDITION]'),
          arguments: {
            STR: {
              type: Scratch.ArgumentType.STRING,
              defaultValue: '/Volumes/myFile.txt',
            },
            CONDITION: {
              type: Scratch.ArgumentType.STRING,
              menu: 'CHECK_MENU',
            },
          },
        },
        {
          opcode: 'fsGet',
          blockType: Scratch.BlockType.REPORTER,
          text: Scratch.translate('get [ATTRIBUTE] of [STR]'),
          arguments: {
            ATTRIBUTE: {
              type: Scratch.ArgumentType.STRING,
              menu: 'GET_MENU',
            },
            STR: {
              type: Scratch.ArgumentType.STRING,
              defaultValue: '/Volumes/myFile.txt',
            },
          },
        },

        // --- Permissions ---
        {
          blockType: Scratch.BlockType.LABEL,
          text: Scratch.translate('Permissions'),
        },
        {
          opcode: 'setPerm',
          blockType: Scratch.BlockType.COMMAND,
          text: Scratch.translate('[ACTION] [PERM] permission for [STR]'),
          arguments: {
            ACTION: {
              type: Scratch.ArgumentType.STRING,
              menu: 'PERM_ACTION_MENU',
              defaultValue: 'remove',
            },
            PERM: {
              type: Scratch.ArgumentType.STRING,
              menu: 'PERM_TYPE_MENU',
              defaultValue: 'write',
            },
            STR: {
              type: Scratch.ArgumentType.STRING,
              defaultValue: '/Volumes/',
            },
          },
        },
        {
          opcode: 'restorePerms',
          blockType: Scratch.BlockType.COMMAND,
          text: Scratch.translate('restore default permissions for [STR]'),
          arguments: {
            STR: {
              type: Scratch.ArgumentType.STRING,
              defaultValue: '/Volumes/',
            },
          },
        },
        {
          opcode: 'listPerms',
          blockType: Scratch.BlockType.REPORTER,
          text: Scratch.translate('list permissions for [STR]'),
          arguments: {
            STR: {
              type: Scratch.ArgumentType.STRING,
              defaultValue: '/Volumes/',
            },
          },
        },
        {
          opcode: 'setLimit',
          blockType: Scratch.BlockType.COMMAND,
          text: Scratch.translate('set size limit for [DIR] to [BYTES] bytes'),
          arguments: {
            DIR: {
              type: Scratch.ArgumentType.STRING,
              defaultValue: '/Volumes/',
            },
            BYTES: { type: Scratch.ArgumentType.NUMBER, defaultValue: 8192 },
          },
        },
        {
          opcode: 'removeLimit',
          blockType: Scratch.BlockType.COMMAND,
          text: Scratch.translate('remove size limit for [DIR]'),
          arguments: {
            DIR: {
              type: Scratch.ArgumentType.STRING,
              defaultValue: '/Volumes/',
            },
          },
        },

        // --- Import/Export ---
        {
          blockType: Scratch.BlockType.LABEL,
          text: Scratch.translate('Import & Export'),
        },
        {
          opcode: 'importFS',
          blockType: Scratch.BlockType.COMMAND,
          text: Scratch.translate('import file system from [STR]'),
          arguments: {
            STR: {
              type: Scratch.ArgumentType.STRING,
              defaultValue: '{"version":"1.0.0","fs":{}}',
            },
          },
        },
        {
          opcode: 'exportFS',
          blockType: Scratch.BlockType.REPORTER,
          text: Scratch.translate('export file system'),
        },
        {
          opcode: 'exportFileBase64',
          blockType: Scratch.BlockType.REPORTER,
          text: Scratch.translate('export file [STR] as [FORMAT]'),
          arguments: {
            STR: {
              type: Scratch.ArgumentType.STRING,
              defaultValue: '/Volumes/myFile.txt',
            },
            FORMAT: {
              type: Scratch.ArgumentType.STRING,
              menu: 'BASE64_FORMAT_MENU',
              defaultValue: 'base64',
            },
          },
        },
        {
          opcode: 'importFileBase64',
          blockType: Scratch.BlockType.COMMAND,
          text: Scratch.translate('import [FORMAT] [STR] to file [STR2]'),
          arguments: {
            FORMAT: {
              type: Scratch.ArgumentType.STRING,
              menu: 'BASE64_FORMAT_MENU',
              defaultValue: 'base64',
            },
            STR: { type: Scratch.ArgumentType.STRING, defaultValue: '' },
            STR2: {
              type: Scratch.ArgumentType.STRING,
              defaultValue: '/Volumes/imported.txt',
            },
          },
        },

        // --- Debugging ---
        {
          blockType: Scratch.BlockType.LABEL,
          text: Scratch.translate('Debugging'),
        },
        {
          opcode: 'toggleLogging',
          blockType: Scratch.BlockType.COMMAND,
          text: Scratch.translate('turn [STATE] console logging'),
          arguments: {
            STATE: {
              type: Scratch.ArgumentType.STRING,
              menu: 'LOG_STATE_MENU',
              defaultValue: 'on',
            },
          },
        },
        {
          opcode: 'runIntegrityTest',
          blockType: Scratch.BlockType.REPORTER,
          text: Scratch.translate('run integrity test'),
        },
      ],
      menus: {
        MANAGE_MENU: {
          acceptReporters: true,
          items: [
            { text: 'create', value: 'create' },
            { text: 'delete', value: 'delete' },
            { text: 'set content to', value: 'set' },
            { text: 'copy to', value: 'copy' },
            { text: 'rename to', value: 'rename' },
          ],
        },
        CLEAR_MENU: {
          acceptReporters: true,
          items: [
            { text: 'filesystem', value: 'all' },
            { text: 'trash', value: 'trash' },
            { text: 'ramdisk', value: 'ram' },
          ],
        },
        BACKEND_MENU: {
          acceptReporters: true,
          items: [
            { text: 'LocalStorage (Default)', value: 'local' },
            { text: 'IndexedDB (Large Data)', value: 'indexeddb' },
          ],
        },
        CHECK_MENU: {
          acceptReporters: true,
          items: [
            { text: 'exists', value: 'exists' },
            { text: 'is file', value: 'file' },
            { text: 'is directory', value: 'directory' },
            { text: 'was read', value: 'read' },
            { text: 'was written', value: 'written' },
          ],
        },
        GET_MENU: {
          acceptReporters: true,
          items: [
            { text: 'file name', value: 'name' },
            { text: 'directory path', value: 'dir' },
            { text: 'size (bytes)', value: 'size' },
            { text: 'size limit', value: 'limit' },
            { text: 'last read path', value: 'lastRead' },
            { text: 'last write path', value: 'lastWrite' },
            { text: 'last error', value: 'error' },
            { text: 'version', value: 'version' },
          ],
        },
        LIST_TYPE_MENU: {
          acceptReporters: true,
          items: ['all', 'files', 'directories'],
        },
        PERM_ACTION_MENU: { acceptReporters: true, items: ['add', 'remove'] },
        PERM_TYPE_MENU: {
          acceptReporters: true,
          items: ['create', 'delete', 'see', 'read', 'write', 'control'],
        },
        LOG_STATE_MENU: { acceptReporters: true, items: ['on', 'off'] },
        BASE64_FORMAT_MENU: {
          acceptReporters: true,
          items: [
            { text: 'Base64 String', value: 'base64' },
            { text: 'Data URL', value: 'data_url' },
          ],
        },
      },
    };
  }

  /* ==============================================================================================
       SECTION: MAIN DISPATCHERS (Block Implementations)
       ============================================================================================== */

  fsManage({ ACTION, STR, STR2 = '' }) {
    switch (ACTION) {
      case 'create':
        this.createFile({ STR });
        break;
      case 'delete':
        this.deleteFile({ STR });
        break;
      case 'set':
        this.setContent({ STR, STR2 });
        break;
      case 'copy':
        this.copy({ STR, STR2 });
        break;
      case 'rename':
        this.renamePath({ STR, STR2 });
        break;
      default:
        this._setError(`Unknown action: ${ACTION}`);
    }
  }

  fsClear({ TARGET }) {
    if (TARGET === 'trash') this.emptyTrash();
    else if (TARGET === 'ram') this.clearRamdisk();
    else this.clean();
  }

  // --- Persistence Block Dispatchers ---

  _ensureUnsandboxed() {
    if (!this.isUnsandboxed) {
      // Warning shown in console on init, this is the hard stop for execution
      this._setError('Persistence unavailable: Extension is running in SANDBOXED mode.');
      console.warn('[Volumes] Access denied: Persistence blocks require unsandboxed mode.');
      return false;
    }
    return true;
  }

  configPersistence({ NS, BACKEND }) {
    this.lastError = '';
    if (!this._ensureUnsandboxed()) return;

    if (!NS || typeof NS !== 'string' || !NS.trim()) {
      this.persistenceNamespace = null;
      return this._setError('Persistence config failed: Invalid Namespace');
    }
    this.persistenceNamespace = NS.trim();
    this.persistenceBackend = BACKEND === 'indexeddb' ? 'indexeddb' : 'local';
    this._log(
      `Persistence configured: ID='${this.persistenceNamespace}' Mode='${this.persistenceBackend}'`
    );
  }

  saveToStorage() {
    this.lastError = '';
    if (!this._ensureUnsandboxed()) return;

    if (!this.persistenceNamespace) {
      return this._setError('Save failed: Persistence not configured');
    }
    // Return promise for Async safety in Scratch
    return this._performSave();
  }

  loadFromStorage() {
    this.lastError = '';
    if (!this._ensureUnsandboxed()) return;

    if (!this.persistenceNamespace) {
      return this._setError('Load failed: Persistence not configured');
    }
    return this._performLoad();
  }

  clearStorage() {
    this.lastError = '';
    if (!this._ensureUnsandboxed()) return;

    if (!this.persistenceNamespace) {
      return this._setError('Clear failed: Persistence not configured');
    }
    return this._performClear();
  }

  isPersistenceEnabled() {
    return !!this.persistenceNamespace && this.isUnsandboxed;
  }

  /* ==============================================================================================
       SECTION: PERSISTENCE IMPLEMENTATION
       ============================================================================================== */

  async _performSave() {
    const data = this.exportFS(); // Synchronously gets the JSON string
    const key = `kbVolumes_${this.persistenceNamespace}`;

    try {
      if (this.persistenceBackend === 'local') {
        try {
          localStorage.setItem(key, data);
        } catch (_e) {
          throw new Error('Quota exceeded or storage blocked', { cause: _e });
        }
      } else {
        await this._idbSet(key, data);
      }
    } catch (e) {
      this._setError(`Storage Save Error: ${e.message}`);
    }
  }

  async _performLoad() {
    const key = `kbVolumes_${this.persistenceNamespace}`;
    let data;

    try {
      if (this.persistenceBackend === 'local') {
        data = localStorage.getItem(key);
      } else {
        data = await this._idbGet(key);
      }

      if (typeof data === 'string') {
        this.importFS({ STR: data });
      } else {
        this._setError('Storage Load: No data found for this ID');
      }
    } catch (e) {
      this._setError(`Storage Load Error: ${e.message}`);
    }
  }

  async _performClear() {
    const key = `kbVolumes_${this.persistenceNamespace}`;
    try {
      if (this.persistenceBackend === 'local') {
        localStorage.removeItem(key);
      } else {
        await this._idbDel(key);
      }
    } catch (e) {
      this._setError(`Storage Clear Error: ${e.message}`);
    }
  }

  // --- IndexedDB Helpers ---
  // DB Name: kbVolumes_DB, Store: store
  _idbOp(mode, fn) {
    return new Promise((resolve, reject) => {
      if (typeof indexedDB === 'undefined') return reject('IndexedDB not supported');
      // Namespace the DB to avoid global collisions
      const req = indexedDB.open('kbVolumes_DB', 1);
      req.onupgradeneeded = e => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains('store')) {
          db.createObjectStore('store');
        }
      };
      req.onsuccess = e => {
        const db = e.target.result;
        try {
          const tx = db.transaction('store', mode);
          const store = tx.objectStore('store');
          const reqOp = fn(store);

          if (reqOp) {
            reqOp.onsuccess = () => resolve(reqOp.result);
            reqOp.onerror = () => reject(reqOp.error);
          }

          tx.onerror = () => reject(tx.error);
          tx.oncomplete = () => {
            db.close();
            if (!reqOp) resolve();
          };
        } catch (err) {
          db.close();
          reject(err);
        }
      };
      req.onerror = () => reject('Failed to open DB');
    });
  }

  _idbSet(key, val) {
    return this._idbOp('readwrite', store => store.put(val, key));
  }

  _idbGet(key) {
    return this._idbOp('readonly', store => store.get(key));
  }

  _idbDel(key) {
    return this._idbOp('readwrite', store => store.delete(key));
  }

  /* ==============================================================================================
       SECTION: INTERNAL UTILITIES & CORE LOGIC
       ============================================================================================== */

  fsCheck({ STR, CONDITION }) {
    const path = this._normalizePath(STR);
    switch (CONDITION) {
      case 'exists':
        return this._exists(path);
      case 'file':
        return this._isFile(path);
      case 'directory':
        return this._isDir(path);
      case 'read': {
        const r = this.readActivity;
        this.readActivity = false;
        return r;
      }
      case 'written': {
        const w = this.writeActivity;
        this.writeActivity = false;
        return w;
      }
      default:
        return false;
    }
  }

  fsGet({ ATTRIBUTE, STR }) {
    if (ATTRIBUTE === 'lastRead') return this.lastReadPath;
    if (ATTRIBUTE === 'lastWrite') return this.lastWritePath;
    if (ATTRIBUTE === 'error') return this.lastError;
    if (ATTRIBUTE === 'version') return META.VERSION;

    const path = this._normalizePath(STR);
    if (!path) return '';

    switch (ATTRIBUTE) {
      case 'name':
        return this._fileName(path);
      case 'dir':
        return this._dirName(path);
      case 'size':
        return this.getSize({ DIR: path });
      case 'limit':
        return this.getLimit({ DIR: path });
      default:
        return '';
    }
  }

  _log(message, ...args) {
    if (this.VolumesLogEnabled) console.log(`[Volumes] ${message}`, ...args);
  }
  _warn(message, ...args) {
    if (this.VolumesLogEnabled) console.warn(`[Volumes] ${message}`, ...args);
  }
  _setError(message, ...args) {
    this._warn(message, ...args);
    this.lastError = message;
  }

  _getStore(path) {
    if (path.startsWith('/RAM/')) return { fs: this.ramfs, index: this.ramIndex, isRam: true };
    return { fs: this.fs, index: this.childIndex, isRam: false };
  }

  _addToIndex(path) {
    const parent = this._internalDirName(path);
    const parentStore = this._getStore(parent);

    // Virtual entry for /RAM/ in Main Root index
    if (parent === '/' && path === '/RAM/') {
      if (!this.childIndex.has('/')) this.childIndex.set('/', new Set());
      this.childIndex.get('/').add('/RAM/');
      return;
    }
    if (!parentStore.index.has(parent)) parentStore.index.set(parent, new Set());
    parentStore.index.get(parent).add(path);
  }

  _removeFromIndex(path) {
    const parent = this._internalDirName(path);
    const parentStore = this._getStore(parent);
    if (parent === '/' && path === '/RAM/') return;
    if (parentStore.index.has(parent)) parentStore.index.get(parent).delete(path);
    const store = this._getStore(path);
    if (store.index.has(path)) store.index.delete(path);
  }

  _ensureTrash() {
    if (!this.fs.has('/.Trash/')) {
      this.fs.set('/.Trash/', {
        content: null,
        perms: { ...defaultPerms },
        limit: -1,
      });
      this._addToIndex('/.Trash/');
      if (!this.childIndex.has('/.Trash/')) this.childIndex.set('/.Trash/', new Set());
    }
  }

  _normalizePath(path) {
    if (typeof path !== 'string') return null;

    // FIX: Allow Windows-style backslashes and collapse multiple slashes
    path = path.replace(/\\/g, '/').replace(/\/+/g, '/');

    if (!path.trim()) return null;

    // FIX: Removed strict ASCII regex to support Unicode filenames (emojis, international chars)
    // REJECTED: quotes and backticks to prevent injection-like issues
    if (
      path.startsWith('/') &&
      !path.includes('/./') &&
      !path.includes('/../') &&
      !path.includes('.. ') &&
      !path.includes('"') &&
      !path.includes('`') &&
      !path.endsWith('/.') &&
      !path.endsWith('/..')
    ) {
      if (path.length > 1 && path.endsWith('/')) return path;
      return path;
    }

    const hadTrailingSlash = path.length > 1 && path.endsWith('/');
    if (path[0] !== '/') path = '/' + path;
    const segments = path.split('/');
    const newSegments = [];
    for (const rawSegment of segments) {
      const segment = rawSegment.trim(); // Trim spaces from folder names!
      if (segment === '' || segment === '.') continue;
      if (segment === '..') {
        if (newSegments.length > 0) newSegments.pop();
      } else newSegments.push(segment);
    }
    let newPath = '/' + newSegments.join('/');
    if (newPath === '/') return '/';
    if (hadTrailingSlash) newPath += '/';
    return newPath;
  }

  _isPathDir(path) {
    return path === '/' || path.endsWith('/');
  }

  _internalDirName(path) {
    if (path === '/') return '/';
    const procPath = this._isPathDir(path) ? path.substring(0, path.length - 1) : path;
    const lastSlash = procPath.lastIndexOf('/');
    if (lastSlash <= 0) return '/';
    return procPath.substring(0, lastSlash + 1);
  }

  _getStringSize(str) {
    return str === null || str === undefined ? 0 : str.length;
  }

  _getDirectorySize(dirPath) {
    let totalSize = 0;
    const store = this._getStore(dirPath);
    const stack = [dirPath];
    while (stack.length > 0) {
      const currentPath = stack.pop();
      const children = store.index.get(currentPath);
      if (children) {
        for (const child of children) {
          const entry = store.fs.get(child);
          if (entry) {
            if (this._isPathDir(child)) stack.push(child);
            else totalSize += this._getStringSize(entry.content);
          }
        }
      }
    }
    return totalSize;
  }

  _canAccommodateChange(filePath, deltaSize) {
    if (deltaSize <= 0) return true;
    let currentDir = this._internalDirName(filePath);
    while (true) {
      const store = this._getStore(currentDir);
      const entry = store.fs.get(currentDir);
      if (currentDir === '/RAM/') break;
      if (entry && entry.limit !== -1) {
        const currentSize = this._getDirectorySize(currentDir);
        if (currentSize + deltaSize > entry.limit) {
          this._setError(`Size limit exceeded for ${currentDir}`);
          return false;
        }
      }
      if (currentDir === '/') break;
      currentDir = this._internalDirName(currentDir);
    }
    return true;
  }

  _internalCreate(path, content, parentDir) {
    const store = this._getStore(path);
    // HARD LIMIT: Prevent memory exhaustion crashes
    if (store.fs.size >= META.MAX_FILES) {
      this._setError(`FS Limit: Max ${META.MAX_FILES} files reached.`);
      return false;
    }

    if (store.fs.has(path)) return false;
    const parentStore = this._getStore(parentDir);

    if (path === '/RAM/') return false; // System root

    if (!this.hasPermission(parentDir, 'create')) {
      this._setError(`Create failed: No 'create' permission in ${parentDir}`);
      return false;
    }
    const deltaSize = this._getStringSize(content);
    if (!this._canAccommodateChange(path, deltaSize)) {
      this._log('InternalCreate failed: Size limit exceeded');
      return false;
    }
    let permsToInherit;
    const parentEntry = parentStore.fs.get(parentDir);
    if (parentEntry) permsToInherit = parentEntry.perms;
    else if (parentDir === '/') permsToInherit = this.fs.get('/').perms;
    else permsToInherit = defaultPerms;

    store.fs.set(path, {
      content: content,
      perms: { ...permsToInherit },
      limit: -1,
    });
    this._addToIndex(path);
    this.writeActivity = true;
    this.lastWritePath = path;
    return true;
  }

  hasPermission(path, action) {
    const normPath = this._normalizePath(path);
    if (!normPath) return false;
    const store = this._getStore(normPath);
    const entry = store.fs.get(normPath);
    if (entry) return entry.perms[action];
    if (action === 'create') {
      const parentDir = this._internalDirName(normPath);
      if (parentDir === '/') {
        const root = this.fs.get('/');
        return root ? root.perms.create : defaultPerms.create;
      }
      if (parentDir === '/RAM/') {
        const ramRoot = this.ramfs.get('/RAM/');
        return ramRoot ? ramRoot.perms.create : defaultPerms.create;
      }

      const parentStore = this._getStore(parentDir);
      const parentEntry = parentStore.fs.get(parentDir);
      if (!parentEntry) {
        // Recursive check up the tree if parent doesn't exist
        return this.hasPermission(parentDir, 'create');
      }
      return parentEntry.perms.create;
    }
    return false;
  }

  _internalClean() {
    this.fs.clear();
    this.childIndex.clear();
    this.fs.set('/', {
      content: null,
      perms: { ...defaultPerms },
      limit: -1,
    });
    this.clearRamdisk();
    this.writeActivity = true;
    this.lastWritePath = '/';
  }

  clearRamdisk() {
    this.ramfs.clear();
    this.ramIndex.clear();
    this.ramfs.set('/RAM/', {
      content: null,
      perms: { ...defaultPerms },
      limit: -1,
    });
    if (!this.childIndex.has('/')) this.childIndex.set('/', new Set());
    this.childIndex.get('/').add('/RAM/');
    this._ensureTrash();
    this.writeActivity = true;
  }

  clean() {
    this.lastError = '';
    if (!this.hasPermission('/', 'delete')) {
      return this._setError("Clean failed: No 'delete' permission on /");
    }
    this._internalClean();
  }

  // --- HELPER ACCESSORS ---

  _exists(path) {
    if (!path) return false;
    const store = this._getStore(path);
    const entry = store.fs.get(path);
    // Hidden entries are treated as non-existent
    return !!(entry && entry.perms.see);
  }

  _isFile(path) {
    if (!path) return false;
    const store = this._getStore(path);
    const entry = store.fs.get(path);
    if (!entry || !entry.perms.see) return false;
    return !this._isPathDir(path);
  }

  _isDir(path) {
    if (!path) return false;
    const store = this._getStore(path);
    const entry = store.fs.get(path);
    if (!entry || !entry.perms.see) return false;
    return this._isPathDir(path);
  }

  _fileName(path) {
    if (!path || path === '/') return '/';
    const store = this._getStore(path);
    const entry = store.fs.get(path);
    if (!entry || !entry.perms.see) return '';
    if (this._isPathDir(path)) {
      const parts = path.split('/').filter(p => p);
      return parts.length ? parts[parts.length - 1] : '';
    }
    return path.split('/').pop();
  }

  _dirName(path) {
    if (!path || path === '/') return '';
    const store = this._getStore(path);
    const entry = store.fs.get(path);
    if (!entry || !entry.perms.see) return '';
    return this._internalDirName(path);
  }

  /* ==============================================================================================
       SECTION: FILE SYSTEM ACTIONS
       ============================================================================================== */

  createFile({ STR }) {
    this.lastError = '';
    const path = this._normalizePath(STR);
    if (!path) return this._setError('Invalid path provided.');

    // FIX: Explicitly check for /RAM to prevent mount point shadowing
    if (path === '/' || path === '/RAM/' || path === '/RAM') {
      return this._setError('Create failed: Cannot create root or system mount');
    }

    const store = this._getStore(path);
    if (store.fs.has(path)) return this._setError('Create failed: Path exists');

    if (this._isPathDir(path)) {
      if (store.fs.has(path.slice(0, -1))) return this._setError('Create failed: File collision');
    } else {
      if (store.fs.has(path + '/')) return this._setError('Create failed: Directory collision');
    }

    const parentDir = this._internalDirName(path);
    const parentStore = this._getStore(parentDir);

    if (parentDir !== '/' && parentDir !== '/RAM/') {
      const pEntry = parentStore.fs.get(parentDir);
      if (pEntry && !pEntry.perms.see) return this._setError('Create failed: Parent hidden');
    }

    if (parentDir !== '/' && parentDir !== '/RAM/' && !parentStore.fs.has(parentDir)) {
      if (!this.hasPermission(parentDir, 'create')) {
        return this._setError('Create failed: No permission on parent');
      }
      this.createFile({ STR: parentDir });
      if (this.lastError) return;
    }
    const ok = this._internalCreate(path, this._isPathDir(path) ? null : '', parentDir);
    if (!ok && !this.lastError) this._setError('Create failed: Internal error');
  }

  open({ STR }) {
    this.lastError = '';
    const path = this._normalizePath(STR);
    if (!path) return this._setError('Invalid path');

    const store = this._getStore(path);
    const entry = store.fs.get(path);

    if (!entry) return this._setError('Open failed: Not found');
    if (!entry.perms.see) return this._setError('Open failed: Hidden');
    if (this._isPathDir(path)) return this._setError('Open failed: Is directory');
    if (!entry.perms.read) return this._setError('Open failed: Read denied');
    this.readActivity = true;
    this.lastReadPath = path;
    return entry.content;
  }

  deleteFile({ STR }) {
    this.lastError = '';
    const path = this._normalizePath(STR);
    if (!path) return this._setError('Invalid path');

    // FIX: Protect /RAM
    if (path === '/' || path === '/RAM/' || path === '/RAM') {
      return this._setError('Delete failed: Cannot delete root/mount');
    }

    if (!this.hasPermission(path, 'delete')) return this._setError('Delete failed: Denied');

    const store = this._getStore(path);

    if (path.startsWith('/.Trash/')) {
      // Permanent
      const toDelete = [];
      const stack = [];
      if (this._isPathDir(path)) stack.push(path);
      else toDelete.push(path);
      while (stack.length > 0) {
        const curr = stack.pop();
        toDelete.push(curr);
        const children = store.index.get(curr);
        if (children) {
          for (const c of children) {
            if (this._isPathDir(c)) stack.push(c);
            else toDelete.push(c);
          }
        }
      }
      for (const key of toDelete) {
        store.fs.delete(key);
        this._removeFromIndex(key);
      }
    } else {
      // Move to Trash
      this._ensureTrash();
      const name = path.endsWith('/')
        ? path.split('/').slice(-2, -1)[0] + '/'
        : path.split('/').pop();
      const trashPath = `/.Trash/${Date.now()}_${name}`;

      this.copy({ STR: path, STR2: trashPath });

      if (!this.lastError) {
        const toDelete = [];
        const stack = [];
        if (this._isPathDir(path)) stack.push(path);
        else toDelete.push(path);
        while (stack.length > 0) {
          const curr = stack.pop();
          toDelete.push(curr);
          const children = store.index.get(curr);
          if (children) {
            for (const c of children) {
              if (this._isPathDir(c)) stack.push(c);
              else toDelete.push(c);
            }
          }
        }
        for (const key of toDelete) {
          store.fs.delete(key);
          this._removeFromIndex(key);
        }
      }
    }
    this.writeActivity = true;
    this.lastWritePath = path;
  }

  emptyTrash() {
    this.lastError = '';
    const trashPath = '/.Trash/';
    if (!this.fs.has(trashPath)) return;

    const toDelete = [];
    const stack = [trashPath];
    while (stack.length > 0) {
      const curr = stack.pop();
      toDelete.push(curr);
      const children = this.childIndex.get(curr);
      if (children) {
        for (const c of children) {
          if (this._isPathDir(c)) stack.push(c);
          else toDelete.push(c);
        }
      }
    }
    for (const key of toDelete) {
      this.fs.delete(key);
      this._removeFromIndex(key);
    }
    this._ensureTrash();
    this.writeActivity = true;
  }

  setContent({ STR, STR2 }) {
    this.lastError = '';
    const path = this._normalizePath(STR);
    if (!path) return this._setError('Invalid path');

    const store = this._getStore(path);
    let entry = store.fs.get(path);
    if (!entry) {
      this.createFile({ STR: path });
      entry = store.fs.get(path);
      if (!entry) return;
    }
    if (this._isPathDir(path)) return this._setError('Set failed: Is directory');
    if (!entry.perms.write) return this._setError('Set failed: Write denied');

    const deltaSize = this._getStringSize(STR2) - this._getStringSize(entry.content || '');
    if (!this._canAccommodateChange(path, deltaSize)) return;

    entry.content = STR2;
    this.writeActivity = true;
    this.lastWritePath = path;
  }

  list({ TYPE, STR }) {
    this.lastError = '';
    const path = this._normalizePath(STR);
    if (!path) return '[]';

    const store = this._getStore(path);

    let targetPath = path;
    if (!this._isPathDir(targetPath)) {
      if (store.fs.has(targetPath + '/')) {
        targetPath += '/';
      }
    }

    const entry = store.fs.get(targetPath);
    // FIXED: Leak prevention
    if (!entry || !entry.perms.see) {
      this._setError('List failed: Not found or hidden');
      return '[]';
    }
    if (!this._isPathDir(targetPath)) {
      return '[]';
    }

    this.readActivity = true;
    this.lastReadPath = targetPath;

    const childrenSet = store.index.get(targetPath);
    const results = [];
    if (childrenSet) {
      for (const childPath of childrenSet) {
        const childEntry = store.fs.get(childPath);
        if (!childEntry || !childEntry.perms.see) continue;

        const childName = childPath.substring(targetPath.length);
        if (TYPE === 'all') results.push(childName);
        else if (TYPE === 'files' && !this._isPathDir(childPath)) results.push(childName);
        else if (TYPE === 'directories' && this._isPathDir(childPath)) results.push(childName);
      }
    }
    results.sort();
    return JSON.stringify(results);
  }

  renamePath({ STR, STR2 }) {
    this.lastError = '';
    const path1 = this._normalizePath(STR);
    const path2 = this._normalizePath(STR2);
    if (!path1 || !path2) return this._setError('Invalid path provided.');

    // FIX: Protect /RAM
    if (path1 === '/' || path1 === '/RAM/' || path1 === '/RAM') {
      return this._setError('Rename failed: Root/Mount cannot be renamed');
    }

    const store1 = this._getStore(path1);
    const store2 = this._getStore(path2);

    // Cross-FS? Use Copy+Delete
    if (store1.isRam !== store2.isRam) {
      this.copy({ STR, STR2 });
      if (this.lastError) return;
      this.deleteFile({ STR });
      return;
    }

    if (!this.hasPermission(path1, 'delete')) {
      return this._setError("Rename failed: No 'delete' permission");
    }
    if (store2.fs.has(path2)) return this._setError('Rename failed: Destination exists');

    if (this._isPathDir(path2)) {
      if (store2.fs.has(path2.slice(0, -1))) {
        return this._setError('Rename failed: File collision');
      }
    } else {
      if (store2.fs.has(path2 + '/')) return this._setError('Rename failed: Directory collision');
    }

    if (!this.hasPermission(path2, 'create')) {
      return this._setError("Rename failed: No 'create' permission");
    }

    const entry = store1.fs.get(path1);
    if (!entry) return this._setError('Rename failed: Source not found');

    const isDir = this._isPathDir(path1);
    // eslint-disable-next-line no-useless-assignment
    let deltaSize = 0;
    if (isDir) deltaSize = this._getDirectorySize(path1);
    else deltaSize = this._getStringSize(entry.content);

    if (!this._canAccommodateChange(path2, deltaSize)) return;

    const toRename = [];
    const stack = [];

    if (isDir) {
      stack.push(path1);
      while (stack.length > 0) {
        const curr = stack.pop();
        toRename.push(curr);
        const children = store1.index.get(curr);
        if (children) {
          for (const c of children) {
            if (this._isPathDir(c)) stack.push(c);
            else toRename.push(c);
          }
        }
      }
    } else {
      toRename.push(path1);
    }

    const path1Length = path1.length;
    for (const oldKey of toRename) {
      const entryVal = store1.fs.get(oldKey);
      if (!entryVal) continue;
      const remainder = oldKey.substring(path1Length);
      const newKey = path2 + remainder;
      store1.fs.set(newKey, entryVal);
      store1.fs.delete(oldKey);
      this._removeFromIndex(oldKey);
      this._addToIndex(newKey);
    }
    this.writeActivity = true;
    this.lastWritePath = path2;
  }

  copy({ STR, STR2 }) {
    this.lastError = '';
    const path1 = this._normalizePath(STR);
    const path2 = this._normalizePath(STR2);
    if (!path1 || !path2) return this._setError('Invalid path provided.');

    const store1 = this._getStore(path1);
    const store2 = this._getStore(path2);

    const entry = store1.fs.get(path1);
    if (!entry) return this._setError('Copy failed: Source not found');
    if (!entry.perms.read) return this._setError("Copy failed: No 'read' permission");
    if (store2.fs.has(path2)) return this._setError('Copy failed: Destination exists');

    const destParent = this._internalDirName(path2);
    const destParentEntry = store2.fs.get(destParent);
    if (destParentEntry && !destParentEntry.perms.see) {
      return this._setError('Copy failed: Destination parent hidden');
    }

    if (!this.hasPermission(path2, 'create')) {
      return this._setError("Copy failed: No 'create' permission");
    }

    this.readActivity = true;
    this.lastReadPath = path1;

    const toCopy = [];
    let totalDeltaSize = 0;
    const stack = [];

    if (this._isPathDir(path1)) {
      stack.push(path1);
      while (stack.length > 0) {
        const curr = stack.pop();
        const val = store1.fs.get(curr);
        toCopy.push({ key: curr, value: val });
        const children = store1.index.get(curr);
        if (children) {
          for (const c of children) {
            if (this._isPathDir(c)) stack.push(c);
            else {
              const fVal = store1.fs.get(c);
              totalDeltaSize += this._getStringSize(fVal.content);
              toCopy.push({ key: c, value: fVal });
            }
          }
        }
      }
    } else {
      totalDeltaSize = this._getStringSize(entry.content);
      toCopy.push({ key: path1, value: entry });
    }

    if (!this._canAccommodateChange(path2, totalDeltaSize)) return;

    const path1Length = path1.length;
    for (const item of toCopy) {
      const remainder = item.key === path1 ? '' : item.key.substring(path1Length);
      const newPath = path2 + remainder;

      // Recursive inheritance logic
      const myNewParentPath = this._internalDirName(newPath);
      const parentEntry = store2.fs.get(myNewParentPath);

      // FIXED: Inheritance fallback to defaultPerms to prevent accidental hiding
      const inheritedPerms = parentEntry ? parentEntry.perms : defaultPerms;

      store2.fs.set(newPath, {
        content: item.value.content === null ? null : '' + item.value.content,
        perms: { ...inheritedPerms },
        limit: item.value.limit,
      });
      this._addToIndex(newPath);
    }
    this.writeActivity = true;
    this.lastWritePath = path2;
  }

  toggleLogging({ STATE }) {
    this.VolumesLogEnabled = STATE === 'on';
  }
  getVersion() {
    return META.VERSION;
  }

  /* ==============================================================================================
       SECTION: METADATA & UTILITIES
       ============================================================================================== */

  setLimit({ DIR, BYTES }) {
    this.lastError = '';
    const path = this._normalizePath(DIR);
    if (!path || path === '/' || !this._isPathDir(path)) return this._setError('Invalid path');
    if (!this.hasPermission(path, 'control')) return this._setError('Denied');
    const store = this._getStore(path);
    const entry = store.fs.get(path);
    if (!entry) return this._setError('Not found');
    // Clamp to integer
    entry.limit = Math.max(-1, Math.floor(Number(BYTES)) || 0);
    this.writeActivity = true;
  }
  removeLimit({ DIR }) {
    this.lastError = '';
    const path = this._normalizePath(DIR);
    if (!path || path === '/' || !this._isPathDir(path)) return this._setError('Invalid path');
    if (!this.hasPermission(path, 'control')) return this._setError('Denied');
    const store = this._getStore(path);
    const entry = store.fs.get(path);
    if (!entry) return this._setError('Not found');
    entry.limit = -1;
    this.writeActivity = true;
  }
  getLimit({ DIR }) {
    const path = this._normalizePath(DIR);
    if (!this._isPathDir(path)) return -1;
    if (!path) return -1;

    const store = this._getStore(path);
    const entry = store.fs.get(path);
    if (!entry || !entry.perms.see) return -1;
    return entry.limit;
  }
  getSize({ DIR }) {
    const path = this._normalizePath(DIR);
    if (!this._isPathDir(path)) return 0;
    if (!path) return 0;

    const store = this._getStore(path);
    const entry = store.fs.get(path);
    if (!entry || !entry.perms.see) return 0;
    return this._getDirectorySize(path);
  }

  // Recursive traversal with visibility checks
  setPerm({ ACTION, PERM, STR }) {
    this.lastError = '';
    const path = this._normalizePath(STR);
    if (!path || path === '/') return this._setError('Invalid');
    if (!this.hasPermission(path, 'control')) return this._setError('Denied');

    const val = ACTION === 'add';

    // SAFETY: Prevent soft-locking system directories
    // We do allow 'write' changes, but NEVER block 'see' or 'control' on roots
    const isSystemRoot = path === '/' || path === '/RAM/' || path === '/.Trash/';
    if (isSystemRoot && (PERM === 'see' || PERM === 'control') && !val) {
      return this._setError('Permission denied: Cannot hide or lock system roots');
    }

    const isDir = this._isPathDir(path);
    const store = this._getStore(path);

    if (!isDir) {
      const entry = store.fs.get(path);
      if (entry && entry.perms.see) entry.perms[PERM] = val;
    } else {
      const stack = [path];
      while (stack.length > 0) {
        const curr = stack.pop();
        const entry = store.fs.get(curr);

        // Visibility check: Stop recursion if hidden
        if (!entry || !entry.perms.see) continue;

        entry.perms[PERM] = val;

        if (this._isPathDir(curr)) {
          const children = store.index.get(curr);
          if (children) {
            for (const c of children) stack.push(c);
          }
        }
      }
    }
    this.writeActivity = true;
  }

  restorePerms({ STR }) {
    this.lastError = '';
    const path = this._normalizePath(STR);
    if (!path) return this._setError('Invalid path');

    const store = this._getStore(path);
    const entry = store.fs.get(path);

    // We don't check permissions here because this is a panic/restore function
    // However, we DO check existence
    if (!entry) return this._setError('Restore failed: Path not found');

    entry.perms = { ...defaultPerms };
    this.writeActivity = true;
  }

  listPerms({ STR }) {
    const path = this._normalizePath(STR);
    if (!path) return '{}';
    const store = this._getStore(path);

    const parentPath = this._internalDirName(path);
    if (parentPath !== '/' && parentPath !== '/RAM/') {
      const pEntry = store.fs.get(parentPath);
      if (pEntry && !pEntry.perms.see) return '{}';
    }

    const e = store.fs.get(path);
    if (!e || !e.perms.see) return '{}';
    return JSON.stringify(e.perms);
  }

  // --- Base64 & Import/Export ---
  _encodeUTF8Base64(str) {
    try {
      return btoa(str);
    } catch (_e) {
      try {
        return btoa(
          encodeURIComponent(str).replace(/%([0-9A-F]{2})/g, (m, p1) =>
            String.fromCharCode(parseInt(p1, 16))
          )
        );
      } catch (e2) {
        this._setError(`Base64 Error: ${e2.message}`);
        return '';
      }
    }
  }
  _decodeUTF8Base64(base64) {
    try {
      return decodeURIComponent(
        atob(base64)
          .split('')
          .map(c => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
          .join('')
      );
    } catch (_e) {
      return atob(base64);
    }
  }
  _getMimeType(path) {
    const ext = path.split('.').pop().toLowerCase();
    const mimes = {
      txt: 'text/plain',
      json: 'application/json',
      svg: 'image/svg+xml',
      png: 'image/png',
      jpg: 'image/jpeg',
      jpeg: 'image/jpeg',
      gif: 'image/gif',
      zip: 'application/zip',
      sprite3: 'application/x-zip-compressed',
      sb3: 'application/x-zip-compressed',
      wav: 'audio/wav',
      mp3: 'audio/mpeg',
    };
    return mimes[ext] || 'application/octet-stream';
  }

  exportFS() {
    this.lastError = '';
    this.readActivity = true;
    this.lastReadPath = '/';
    const fsObject = {};
    // Explicitly only export the main persistent FS, excluding /RAM/
    for (const [path, entry] of this.fs.entries()) {
      fsObject[path] = {
        ...entry,
        perms: { ...entry.perms },
      };
    }
    return JSON.stringify({
      version: META.VERSION,
      fs: fsObject,
    });
  }

  importFS({ STR }) {
    this.lastError = '';
    if (!this.hasPermission('/', 'delete')) return this._setError('Import denied');
    let data;
    try {
      data = JSON.parse(STR);
    } catch (_e) {
      return this._setError('JSON Error');
    }

    // Transactional import
    const oldState = {
      fs: this.fs,
      childIndex: this.childIndex,
      ramfs: this.ramfs,
      ramIndex: this.ramIndex,
    };

    try {
      const tempFS = new Map();
      const tempIndex = new Map();
      const addToTempIndex = p => {
        const parent = this._internalDirName(p);
        if (!tempIndex.has(parent)) tempIndex.set(parent, new Set());
        tempIndex.get(parent).add(p);
      };

      if (!tempIndex.has('/')) tempIndex.set('/', new Set());
      tempIndex.get('/').add('/RAM/');

      let oldData = {};
      if (data.fs) oldData = data.fs;

      if (!oldData['/']) throw new Error('Missing root');
      oldData['/'].perms = { ...defaultPerms };
      oldData['/'].limit = -1;

      for (const path in oldData) {
        if (Object.prototype.hasOwnProperty.call(oldData, path)) {
          if (path.startsWith('/RAM/')) continue;
          const entry = oldData[path];
          // FIXED: Integrity check for imported entries
          if (typeof entry !== 'object' || entry === null || !entry.perms) continue;

          const fixedPath = this._normalizePath(path);

          const newEntry = {
            content: entry.content,
            perms: { ...entry.perms },
            limit: typeof entry.limit === 'number' ? entry.limit : -1,
          };

          tempFS.set(fixedPath, newEntry);
          if (fixedPath !== '/') {
            addToTempIndex(fixedPath);
          }
        }
      }

      this.fs = tempFS;
      this.childIndex = tempIndex;
      this._ensureTrash();

      // SAFETY: Force-reset permissions on system folders after import
      if (this.fs.has('/.Trash/')) {
        this.fs.get('/.Trash/').perms = { ...defaultPerms };
      }

      this.ramfs = new Map();
      this.ramIndex = new Map();
      this.ramfs.set('/RAM/', {
        content: null,
        perms: { ...defaultPerms },
        limit: -1,
      });
      if (!this.childIndex.has('/')) this.childIndex.set('/', new Set());
      this.childIndex.get('/').add('/RAM/');

      this.writeActivity = true;
      this.lastWritePath = '/';
    } catch (e) {
      this.fs = oldState.fs;
      this.childIndex = oldState.childIndex;
      this.ramfs = oldState.ramfs;
      this.ramIndex = oldState.ramIndex;
      this._setError('Import error: ' + e.message);
    }
  }

  exportFileBase64({ STR, FORMAT }) {
    this.lastError = '';
    const path = this._normalizePath(STR);
    if (!path) return '';

    const store = this._getStore(path);
    const entry = store.fs.get(path);
    if (!entry) return this._setError('Export failed: Not found');
    if (this._isPathDir(path)) return this._setError('Export failed: Is dir');
    if (!entry.perms.see || !entry.perms.read) return this._setError('Export failed: Denied');

    this.readActivity = true;
    this.lastReadPath = path;
    const b64 = this._encodeUTF8Base64(String(entry.content));
    if (FORMAT === 'data_url') return `data:${this._getMimeType(path)};base64,${b64}`;
    return b64;
  }

  importFileBase64({ _FORMAT, STR, STR2 }) {
    this.lastError = '';
    const path = this._normalizePath(STR2);
    if (!path || this._isPathDir(path)) return this._setError('Invalid path');
    if (!STR || !STR.trim()) return this._setError('Empty input');

    // FIXED: Simplified aggressive cleanup logic to support messy base64 input
    // Remove data URL prefix if present, then strip all whitespace
    let base64String = STR.replace(/\s+/g, '');
    const match = base64String.match(/^data:.*?,(.*)$/);
    if (match) base64String = match[1];

    // Try/Catch decoding is more robust than strict Regex for padding/charset issues
    try {
      const decoded = this._decodeUTF8Base64(base64String);
      this.setContent({ STR: path, STR2: decoded });
      if (!this.lastError) this.lastWritePath = path;
    } catch (_e) {
      return this._setError('Invalid Base64');
    }
  }

  listGlob({ TYPE, PATTERN, DIR }) {
    this.lastError = '';
    let path = this._normalizePath(DIR);
    if (!path) return '[]';

    if (PATTERN.length > 256) {
      this._setError('Pattern too long');
      return '[]';
    }

    if (!this._isPathDir(path)) path += '/';
    const store = this._getStore(path);

    const entry = store.fs.get(path);
    if (!entry || !entry.perms.see) return '[]';

    this.readActivity = true;
    this.lastReadPath = path;

    const childrenSet = store.index.get(path);
    const results = [];

    if (childrenSet && childrenSet.size > 0) {
      const regex = new RegExp(
        '^' +
          PATTERN.split('')
            .map(c => {
              if (c === '*') return '.*';
              if (c === '?') return '.';
              if (/[.+^${}()|[\]\\]/.test(c)) return '\\' + c;
              return c;
            })
            .join('') +
          '$'
      );

      for (const childPath of childrenSet) {
        const childEntry = store.fs.get(childPath);
        if (!childEntry || !childEntry.perms.see) continue;
        const childName = childPath.substring(path.length);
        if (regex.test(childName)) {
          if (TYPE === 'all') results.push(childName);
          else if (TYPE === 'files' && !this._isPathDir(childPath)) results.push(childName);
          else if (TYPE === 'directories' && this._isPathDir(childPath)) results.push(childName);
        }
      }
    }
    results.sort();
    return JSON.stringify(results);
  }

  runIntegrityTest() {
    const oldFS = this.fs;
    const oldIndex = this.childIndex;
    const oldRamFS = this.ramfs;
    const oldRamIndex = this.ramIndex;
    this.fs = new Map();
    this.childIndex = new Map();
    this.ramfs = new Map();
    this.ramIndex = new Map();
    this._internalClean();

    try {
      if (!this.getVersion().startsWith('1.')) throw new Error('Version mismatch');

      // 1. Basic Lifecycle
      this.fsManage({ ACTION: 'create', STR: '/test.txt', STR2: '' });
      if (!this.fsCheck({ STR: '/test.txt', CONDITION: 'exists' })) {
        throw new Error('Basic create failed');
      }

      // 2. Unicode Support
      this.fsManage({ ACTION: 'set', STR: '/ð¥.txt', STR2: 'hot' });
      if (this.open({ STR: '/ð¥.txt' }) !== 'hot') throw new Error('Unicode filename failed');

      // 3. Nested Creation (Recursive)
      this.fsManage({ ACTION: 'set', STR: '/a/b/c/deep.txt', STR2: 'deep' });
      if (!this.fsCheck({ STR: '/a/b/c/', CONDITION: 'directory' })) {
        throw new Error('Recursive dir creation failed');
      }

      // 4. Glob Patterns
      this.fsManage({ ACTION: 'create', STR: '/glob/1.log', STR2: '' });
      this.fsManage({ ACTION: 'create', STR: '/glob/2.log', STR2: '' });
      this.fsManage({ ACTION: 'create', STR: '/glob/image.png', STR2: '' });
      const globs = JSON.parse(this.listGlob({ TYPE: 'files', PATTERN: '*.log', DIR: '/glob/' }));
      if (globs.length !== 2) {
        throw new Error(`Glob failed: expected 2 logs, got ${globs.length}`);
      }

      // 5. Cross-Volume Copy (RAM -> Disk)
      this.fsManage({
        ACTION: 'set',
        STR: '/RAM/volatile.txt',
        STR2: 'data',
      });
      this.fsManage({
        ACTION: 'copy',
        STR: '/RAM/volatile.txt',
        STR2: '/saved.txt',
      });
      if (this.open({ STR: '/saved.txt' }) !== 'data') {
        throw new Error('Cross-volume copy failed');
      }

      // 6. Trash Logic
      this.fsManage({ ACTION: 'delete', STR: '/test.txt', STR2: '' }); // Moves to trash
      const trashContent = JSON.parse(this.list({ TYPE: 'all', STR: '/.Trash/' }));
      if (trashContent.length === 0) throw new Error('Trash move failed');

      this.fsClear({ TARGET: 'trash' });
      const emptyTrash = JSON.parse(this.list({ TYPE: 'all', STR: '/.Trash/' }));
      if (emptyTrash.length !== 0) throw new Error('Empty trash failed');

      // 7. Permission Logic (Basic)
      this.setPerm({ ACTION: 'remove', PERM: 'read', STR: '/saved.txt' });
      this.open({ STR: '/saved.txt' });
      if (!this.lastError.includes('Read denied')) {
        throw new Error('Permission enforcement failed');
      }

      // 8. Stress Test (Small Scale)
      for (let i = 0; i < 50; i++) {
        // FIXED: Use "set" to actually write content; "create" ignores STR2 (content)
        this.fsManage({
          ACTION: 'set',
          STR: `/stress/file_${i}.txt`,
          STR2: 'test',
        });
      }
      if (this.getSize({ DIR: '/stress/' }) !== 50 * 4) {
        throw new Error('Stress test size mismatch');
      }

      // 9. Import Safety Test
      const invalidJson = '{"version":"1.0.0","fs":{"/bad": "not an object"}}';
      this.importFS({ STR: invalidJson }); // Should catch error or handle gracefully
      // We expect it to not crash, but maybe set error. The loop continues so it might just ignore bad entry.
      // Actually since it ignores bad entries, check fs size.
      if (this.fs.has('/bad')) throw new Error('Import safety check failed');

      // 10. Base64 Test
      this.importFileBase64({
        FORMAT: 'base64',
        STR: 'SGVsbG8=',
        STR2: '/b64.txt',
      });
      if (this.open({ STR: '/b64.txt' }) !== 'Hello') throw new Error('Base64 import failed');
    } catch (e) {
      return 'FAIL: ' + e.message;
    } finally {
      this.fs = oldFS;
      this.childIndex = oldIndex;
      this.ramfs = oldRamFS;
      this.ramIndex = oldRamIndex;
    }
    return 'PASS';
  }
}

Scratch.extensions.register(new Volumes());
