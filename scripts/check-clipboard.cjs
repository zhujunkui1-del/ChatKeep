const {app,clipboard}=require('electron');const {copyKey}=require('../src/clipboard.cjs');
app.whenReady().then(()=>{
 const previous={text:clipboard.readText(),html:clipboard.readHTML(),rtf:clipboard.readRTF(),image:clipboard.readImage()};
 try{const result=copyKey(clipboard,'01'.repeat(32));console.log(JSON.stringify({systemClipboardVerified:result.copied}));}
 catch{console.log(JSON.stringify({systemClipboardVerified:false}));}
 finally{clipboard.write(previous);app.exit(0);}
});
