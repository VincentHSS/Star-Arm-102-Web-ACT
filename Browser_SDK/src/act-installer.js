const encoder = new TextEncoder();
const decoder = new TextDecoder();
const MAX_TAR = 8 * 1024 * 1024;
const TEMPLATE_SHA256 = '90bd323c5a63b612b06f19b60a48c8d3a88dc94ae1149e0afe8291395fad53bb';
function text(bytes) { return decoder.decode(bytes).replace(/\0.*$/s, ''); }
function concat(parts) { const output=new Uint8Array(parts.reduce((n,p)=>n+p.length,0));let position=0;for(const part of parts){output.set(part,position);position+=part.length;}return output; }
function readAr(bytes) {
  if(text(bytes.subarray(0,8))!=='!<arch>\n')throw Error('运行组件安装模板格式无效');
  const entries=new Map();let offset=8;
  while(offset<bytes.length){
    const header=bytes.subarray(offset,offset+60);if(header.length!==60||text(header.subarray(58,60))!=='`\n')throw Error('运行组件安装模板不完整');
    const raw=text(header.subarray(48,58)).trim();if(!/^\d+$/.test(raw))throw Error('运行组件安装模板大小无效');
    const size=Number(raw),name=text(header.subarray(0,16)).trim().replace(/\/$/,'');
    if(size<0||offset+60+size>bytes.length||entries.has(name))throw Error('运行组件安装模板条目无效');
    entries.set(name,bytes.slice(offset+60,offset+60+size));offset+=60+size+(size%2);
  }
  if(offset!==bytes.length||text(entries.get('debian-binary')||new Uint8Array())!=='2.0\n')throw Error('运行组件安装模板版本无效');
  return entries;
}
function writeAr(entries){const parts=[encoder.encode('!<arch>\n')];for(const name of ['debian-binary','control.tar.gz','data.tar.gz']){const data=entries.get(name);if(!data)throw Error('运行组件安装模板缺少内容');const header=(name+'/').padEnd(16)+'0'.padEnd(12)+'0'.padEnd(6)+'0'.padEnd(6)+'100644'.padEnd(8)+String(data.length).padEnd(10)+'`\n';parts.push(encoder.encode(header),data);if(data.length%2)parts.push(encoder.encode('\n'));}return concat(parts);}
async function gzip(bytes,decompress=false){const Constructor=decompress?globalThis.DecompressionStream:globalThis.CompressionStream;if(!Constructor)throw Error('当前浏览器无法生成安装文件，请使用新版 Chrome / Edge');const result=new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(new Constructor('gzip'))).arrayBuffer());if(decompress&&result.length>MAX_TAR)throw Error('运行组件安装模板过大');return result;}
function readTar(bytes){const files=[];let offset=0;while(offset+512<=bytes.length){const header=bytes.slice(offset,offset+512);if(header.every(value=>value===0))break;const sizeString=text(header.subarray(124,136)).trim();if(!/^[0-7]+$/.test(sizeString))throw Error('安装模板 TAR 大小无效');const size=parseInt(sizeString,8),name=text(header.subarray(0,100));let checksum=0;for(let i=0;i<512;i++)checksum+=(i>=148&&i<156)?32:header[i];if(checksum!==parseInt(text(header.subarray(148,156)).trim(),8))throw Error('安装模板校验失败');if(![0,48,53].includes(header[156])||(header[156]===53&&size!==0)||offset+512+size>bytes.length)throw Error('安装模板包含不支持的条目');files.push({name,header,data:bytes.slice(offset+512,offset+512+size)});offset+=512+Math.ceil(size/512)*512;}return files;}
function writeTar(files){const parts=[];for(const file of files){const header=file.header.slice();header.set(encoder.encode(file.data.length.toString(8).padStart(11,'0')+'\0'),124);header.fill(32,148,156);const checksum=header.reduce((sum,value)=>sum+value,0);header.set(encoder.encode(checksum.toString(8).padStart(6,'0')+'\0 '),148);parts.push(header,file.data);const padding=(512-file.data.length%512)%512;if(padding)parts.push(new Uint8Array(padding));}parts.push(new Uint8Array(1024));return concat(parts);}
function canonicalOrigin(value){const url=new URL(value);if(url.username||url.password||url.search||url.hash||!['http:','https:'].includes(url.protocol)||(url.protocol==='http:'&&!['localhost','127.0.0.1','[::1]'].includes(url.hostname)))throw Error('请通过 HTTPS 打开网站后下载运行组件');return url.origin;}

export async function createWebsiteInstaller(origin=location.origin){
  const site=canonicalOrigin(origin);
  if(!globalThis.crypto?.subtle)throw Error('请通过 HTTPS 打开网站，或在本机浏览器中预览');
  const response=await fetch(new URL('../downloads/act-runtime-template.deb',import.meta.url),{cache:'no-store',signal:AbortSignal.timeout(30000)});
  if(!response.ok)throw Error('找不到运行组件安装模板，请确认网站 downloads 目录已完整上传');
  const bytes=new Uint8Array(await response.arrayBuffer());
  const hash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(value=>value.toString(16).padStart(2,'0')).join('');
  if(hash!==TEMPLATE_SHA256)throw Error('运行组件安装模板与网页版本不一致，请刷新网页或更新网站文件');
  const archive=readAr(bytes);
  const data=readTar(await gzip(archive.get('data.tar.gz'),true));
  const binding=data.find(file=>file.name==='./opt/star-arm-act/website.json');if(!binding)throw Error('运行组件安装模板缺少网站配置');
  binding.data=encoder.encode(JSON.stringify({origin:site}));
  const controls=readTar(await gzip(archive.get('control.tar.gz'),true));
  // Debian's md5sums metadata is optional. The SHA-256 download check above
  // validates the template; omit stale metadata after changing website.json.
  const filtered=controls.filter(file=>file.name!=='./md5sums');
  const control=filtered.find(file=>file.name==='./control');if(!control)throw Error('运行组件安装模板缺少包信息');
  const version='1.0.12+site.'+new Date().toISOString().replace(/\D/g,'');
  const size=Math.ceil(data.reduce((sum,file)=>sum+file.data.length,0)/1024);
  control.data=encoder.encode(text(control.data).split('\n').map(line=>line.startsWith('Version: ')?'Version: '+version:line.startsWith('Installed-Size: ')?'Installed-Size: '+size:line).join('\n'));
  archive.set('data.tar.gz',await gzip(writeTar(data)));
  archive.set('control.tar.gz',await gzip(writeTar(filtered)));
  return {blob:new Blob([writeAr(archive)],{type:'application/vnd.debian.binary-package'}),filename:'star-arm-act_1.0.12_all.deb',origin:site};
}
