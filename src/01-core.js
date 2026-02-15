const defaultPerms = {
  create: true,
  delete: true,
  see: true,
  read: true,
  write: true,
  control: true,
};

const META = {
  VERSION: '1.0.0',
  NAME: 'Volumes',
  AUTHOR: 'Kane Boswell',
  MAX_FILES: 10000,
};

class Volumes {
  constructor() {
    this.fs = new Map();
    this.childIndex = new Map();
    this.ramfs = new Map();
    this.ramIndex = new Map();
    this.persistenceNamespace = null;
    this.persistenceBackend = 'local';
    this.VolumesLogEnabled = false;
    this.lastError = '';
    this.readActivity = false;
    this.writeActivity = false;
    this.lastReadPath = '';
    this.lastWritePath = '';
    this.runtime = Scratch.vm ? Scratch.vm.runtime : null;
    this.isUnsandboxed = !!Scratch.extensions.unsandboxed;

    this._internalClean();

    if (this.runtime && !this.runtime['_VolumesProjectStartHooked']) {
      this.runtime['_VolumesProjectStartHooked'] = true;
      this.runtime.on('PROJECT_START', () => {
        this.clearRamdisk();
      });
    }
  }

  getInfo() {
    return {
      id: 'kbVolumes',
      name: `${META.NAME} (v${META.VERSION})`,
      color1: '#00bf63',
      color2: '#00a355',
      color3: '#006836',
      blocks: [
        { blockType: Scratch.BlockType.LABEL, text: Scratch.translate('File Operations') },
        {
          opcode: 'fsManage',
          blockType: Scratch.BlockType.COMMAND,
          text: Scratch.translate('file [ACTION] path [STR] value [STR2]'),
          arguments: {
            ACTION: { type: Scratch.ArgumentType.STRING, menu: 'MANAGE_MENU' },
            STR: { type: Scratch.ArgumentType.STRING, defaultValue: '/Volumes/myFile.txt' },
            STR2: { type: Scratch.ArgumentType.STRING, defaultValue: 'Hello World' },
          },
        },
        {
          opcode: 'open',
          blockType: Scratch.BlockType.REPORTER,
          text: Scratch.translate('read content of [STR]'),
          arguments: { STR: { type: Scratch.ArgumentType.STRING, defaultValue: '/Volumes/myFile.txt' } },
        },
        {
          opcode: 'list',
          blockType: Scratch.BlockType.REPORTER,
          text: Scratch.translate('list [TYPE] under [STR] as JSON'),
          arguments: {
            TYPE: { type: Scratch.ArgumentType.STRING, menu: 'LIST_TYPE_MENU', defaultValue: 'all' },
            STR: { type: Scratch.ArgumentType.STRING, defaultValue: '/Volumes/' },
          },
        },
        {
          opcode: 'fsClear',
          blockType: Scratch.BlockType.COMMAND,
          text: Scratch.translate('clear [TARGET]'),
          arguments: { TARGET: { type: Scratch.ArgumentType.STRING, menu: 'CLEAR_MENU' } },
        },
        { blockType: Scratch.BlockType.LABEL, text: Scratch.translate('Persistence') },
        {
          opcode: 'configPersistence',
          blockType: Scratch.BlockType.COMMAND,
          text: Scratch.translate('enable persistence ID [NS] using [BACKEND]'),
          arguments: {
            NS: { type: Scratch.ArgumentType.STRING, defaultValue: 'MyGameData' },
            BACKEND: { type: Scratch.ArgumentType.STRING, menu: 'BACKEND_MENU', defaultValue: 'local' },
          },
        },
        { opcode: 'saveToStorage', blockType: Scratch.BlockType.COMMAND, text: Scratch.translate('save filesystem to browser storage') },
        { opcode: 'loadFromStorage', blockType: Scratch.BlockType.COMMAND, text: Scratch.translate('load filesystem from browser storage') },
        { blockType: Scratch.BlockType.LABEL, text: Scratch.translate('Info & Checks') },
        {
          opcode: 'fsGet',
          blockType: Scratch.BlockType.REPORTER,
          text: Scratch.translate('get [ATTRIBUTE] of [STR]'),
          arguments: {
            ATTRIBUTE: { type: Scratch.ArgumentType.STRING, menu: 'GET_MENU' },
            STR: { type: Scratch.ArgumentType.STRING, defaultValue: '/Volumes/myFile.txt' },
          },
        },
        {
          opcode: 'setLimit',
          blockType: Scratch.BlockType.COMMAND,
          text: Scratch.translate('set size limit for [DIR] to [BYTES] bytes'),
          arguments: {
            DIR: { type: Scratch.ArgumentType.STRING, defaultValue: '/Volumes/' },
            BYTES: { type: Scratch.ArgumentType.NUMBER, defaultValue: 8192 },
          },
        },
        { blockType: Scratch.BlockType.LABEL, text: Scratch.translate('Import & Export') },
        {
          opcode: 'exportFileBase64',
          blockType: Scratch.BlockType.REPORTER,
          text: Scratch.translate('export file [STR] as [FORMAT]'),
          arguments: {
            STR: { type: Scratch.ArgumentType.STRING, defaultValue: '/Volumes/myFile.txt' },
            FORMAT: { type: Scratch.ArgumentType.STRING, menu: 'BASE64_FORMAT_MENU', defaultValue: 'base64' },
          },
        },
      ],
      menus: {
        MANAGE_MENU: { acceptReporters: true, items: ['create', 'delete', 'set', 'copy', 'rename'] },
        CLEAR_MENU: { acceptReporters: true, items: ['all', 'trash', 'ram'] },
        BACKEND_MENU: { acceptReporters: true, items: ['local', 'indexeddb'] },
        GET_MENU: { acceptReporters: true, items: ['name', 'dir', 'size', 'limit', 'error'] },
        LIST_TYPE_MENU: { items: ['all', 'files', 'directories'] },
        BASE64_FORMAT_MENU: { items: ['base64', 'data_url'] },
      },
    };
  }

  /* --- Persistence Helpers --- */

  _idbOp(mode, fn) {
    return new Promise((resolve, reject) => {
      if (typeof indexedDB === 'undefined') return reject('IndexedDB not supported');
      const req = indexedDB.open('kbVolumes_DB', 1);

      req.onupgradeneeded = (event) => {
        const db = event.target.result;
        if (!db.objectStoreNames.contains('store')) {
          db.createObjectStore('store');
        }
      };

      req.onsuccess = (event) => {
        const db = event.target.result;
        try {
          const tx = db.transaction('store', mode);
          const store = tx.objectStore('store');
          const reqOp = fn(store);

          if (reqOp) {
            reqOp.onsuccess = () => {
              const res = reqOp.result;
              db.close();
              resolve(res);
            };
            reqOp.onerror = () => {
              const err = reqOp.error;
              db.close();
              reject(err);
            };
          }

          tx.onerror = () => {
            db.close();
            reject(tx.error);
          };

          tx.oncomplete = () => {
            if (!reqOp) {
              db.close();
              resolve();
            }
          };
        } catch (err) {
          db.close();
          reject(err);
        }
      };
      req.onerror = () => reject('Failed to open DB');
    });
  }

  _idbSet(key, val) { return this._idbOp('readwrite', (s) => s.put(val, key)); }
  _idbGet(key) { return this._idbOp('readonly', (s) => s.get(key)); }
  _idbDel(key) { return this._idbOp('readwrite', (s) => s.delete(key)); }

  /* --- File System Core --- */

  _getStringSize(str) {
    if (str === null || str === undefined) return 0;
    return new TextEncoder().encode(String(str)).length;
  }

  _normalizePath(path) {
    if (typeof path !== 'string') return null;
    path = path.replace(/\\/g, '/').replace(/\/+/g, '/');
    if (!path.trim()) return null;
    if (path[0] !== '/') path = '/' + path;
    return path;
  }

  _getStore(path) {
    if (path.startsWith('/RAM/')) return { fs: this.ramfs, index: this.ramIndex, isRam: true };
    return { fs: this.fs, index: this.childIndex, isRam: false };
  }

  _internalDirName(path) {
    if (path === '/') return '/';
    const p = path.endsWith('/') ? path.slice(0, -1) : path;
    const last = p.lastIndexOf('/');
    return last <= 0 ? '/' : p.substring(0, last + 1);
  }

  _getDirectorySize(dirPath) {
    let total = 0;
    const store = this._getStore(dirPath);
    const stack = [dirPath];
    while (stack.length) {
      const curr = stack.pop();
      const children = store.index.get(curr);
      if (children) {
        for (const c of children) {
          const entry = store.fs.get(c);
          if (entry) {
            if (c.endsWith('/')) stack.push(c);
            else total += this._getStringSize(entry.content);
          }
        }
      }
    }
    return total;
  }

  _canAccommodate(path, delta) {
    let curr = this._internalDirName(path);
    while (true) {
      const store = this._getStore(curr);
      const entry = store.fs.get(curr);
      if (curr !== '/RAM/' && entry && entry.limit !== -1) {
        if (this._getDirectorySize(curr) + delta > entry.limit) return false;
      }
      if (curr === '/') break;
      curr = this._internalDirName(curr);
    }
    return true;
  }

  /* --- Block Implementations --- */

  renamePath({ STR, STR2 }) {
    const p1 = this._normalizePath(STR);
    const p2 = this._normalizePath(STR2);
    if (!p1 || !p2) return;

    const s1 = this._getStore(p1);
    const s2 = this._getStore(p2);

    if (s1.isRam !== s2.isRam) {
      this.copy({ STR, STR2 });
      if (!this.lastError) {
        this.deleteFile({ STR });
        this.writeActivity = true;
        this.lastWritePath = p2;
      }
      return;
    }
    this.copy({ STR, STR2 });
    if (!this.lastError) {
      const oldEntry = s1.fs.get(p1);
      s1.fs.delete(p1);
      this.writeActivity = true;
      this.lastWritePath = p2;
    }
  }

  exportFileBase64({ STR, FORMAT }) {
    const path = this._normalizePath(STR);
    if (!path) return '';

    const store = this._getStore(path);
    const entry = store.fs.get(path);

    if (!entry) {
      this._setError('Export failed: Not found');
      return '';
    }
    if (path.endsWith('/')) {
      this._setError('Export failed: Is dir');
      return '';
    }
    if (!entry.perms.read) {
      this._setError('Export failed: Denied');
      return '';
    }

    this.readActivity = true;
    this.lastReadPath = path;
    const b64 = btoa(String(entry.content));
    return FORMAT === 'data_url' ? `data:application/octet-stream;base64,${b64}` : b64;
  }

  _decodeUTF8Base64(base64) {
    try {
      return decodeURIComponent(
        atob(base64)
          .split('')
          .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
          .join('')
      );
    } catch (err) {
      console.warn(`[Volumes] _decodeUTF8Base64: UTF-8 decoding failed. Returning raw ASCII. Data length: ${base64.length}`);
      return atob(base64);
    }
  }

  _internalClean() {
    this.fs.clear();
    this.childIndex.clear();
    this.fs.set('/', { content: null, perms: { ...defaultPerms }, limit: -1 });
  }

  clearRamdisk() {
    this.ramfs.clear();
    this.ramIndex.clear();
    this.ramfs.set('/RAM/', { content: null, perms: { ...defaultPerms }, limit: -1 });
  }

  _setError(m) { this.lastError = m; }
}

Scratch.extensions.register(new Volumes());