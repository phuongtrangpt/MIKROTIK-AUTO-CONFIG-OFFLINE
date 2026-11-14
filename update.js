/* MikroTik Auto Config Studio — GitHub Release version checker (v1.4.0).
 * Không tải/gửi cấu hình hay mật khẩu; chỉ đọc metadata công khai. */
(function(root,factory){
  const api=factory();
  if(typeof module==='object' && module.exports)module.exports=api;
  root.MTUpdater=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
 'use strict';
 const OWNER='phuongtrangpt';
 const REPO='MIKROTIK-AUTO-CONFIG-OFFLINE';
 const API_URL='https://api.github.com/repos/'+OWNER+'/'+REPO+'/releases/latest';
 function toSemver(s){
   const m=/^(?:v)?(\d+)\.(\d+)\.(\d+)$/.exec(String(s||''));
   if(!m)return null;
   const parts=m.slice(1).map(Number);
   return parts.every(n=>Number.isSafeInteger(n))?parts:null;
 }
 function compareVersions(a,b){
   const x=toSemver(a),y=toSemver(b);
   if(!x||!y)throw new Error('Phiên bản không hợp lệ để so sánh.');
   for(let i=0;i<3;i++)if(x[i]!==y[i])return x[i]>y[i]?1:-1;
   return 0;
 }
 function parseRelease(release,currentVersion){
   if(!release || typeof release!=='object'||release.draft||release.prerelease)throw new Error('GitHub chưa có bản phát hành ổn định hợp lệ.');
   const tag=String(release.tag_name||'');
   if(!/^v\d+\.\d+\.\d+$/.test(tag))throw new Error('Tag mới nhất không đúng dạng phiên bản vX.Y.Z.');
   const version=tag.slice(1);
   if(compareVersions(version,currentVersion)<=0)return {state:'current',version:currentVersion};
   const name='MikroTik_Auto_Config_Studio_'+tag+'_Windows_Offline.zip';
   const url='https://github.com/'+OWNER+'/'+REPO+'/releases/download/'+tag+'/'+name;
   const asset=Array.isArray(release.assets)?release.assets.find(a=>a.name===name && a.browser_download_url===url && a.size>5000):null;
   if(!asset)throw new Error('Bản mới chưa có ZIP Windows Offline đúng tên. Kiểm tra GitHub Releases.');
   return {state:'update',version,url,name,size:asset.size};
 }
 async function checkLatest(currentVersion, fetcher){
   const request=fetcher||(typeof fetch==='function'?fetch:null);
   if(typeof request!=='function')throw new Error('Trình duyệt không hỗ trợ kiểm tra cập nhật.');
   let response;
   try {response=await request(API_URL,{method:'GET',headers:{'Accept':'application/vnd.github+json'},cache:'no-store'});}
   catch(e){throw new Error('Không kết nối được GitHub. Kiểm tra Internet hoặc tường lửa.');}
   if(!response||!response.ok){
     if(response&&response.status===403)throw new Error('GitHub giới hạn số lần kiểm tra. Hãy thử lại sau.');
     throw new Error('GitHub trả về lỗi '+(response?.status||'không xác định')+'.');
   }
   let release;
   try{release=await response.json();}catch{throw new Error('Không đọc được dữ liệu phát hành từ GitHub.');}
   return parseRelease(release,currentVersion);
 }
 return {API_URL,compareVersions,parseRelease,checkLatest};
});