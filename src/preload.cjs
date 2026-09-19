const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('probe',{call:(action,data)=>ipcRenderer.invoke('probe',action,data),onReset:callback=>ipcRenderer.on('service-reset',()=>callback())});
