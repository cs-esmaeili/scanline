// Bridges the webview UI (which talks to `acquireVsCodeApi`) onto Electron IPC,
// so media/overlay.js runs unchanged outside VS Code.
const { ipcRenderer } = require('electron');

window.acquireVsCodeApi = function acquireVsCodeApi() {
  return {
    postMessage(message) {
      ipcRenderer.send('overlay:message', message);
    },
    getState() {
      return undefined;
    },
    setState() {
      /* not needed: the window keeps its DOM while hidden */
    },
  };
};

ipcRenderer.on('overlay:message', (_event, message) => {
  window.dispatchEvent(new MessageEvent('message', { data: message }));
});
