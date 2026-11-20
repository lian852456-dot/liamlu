import {networkInterfaces} from 'node:os';
export function privateIPv4(address) {
  const raw = address.replace(/^::ffff:/, ''), parts = raw.split('.').map(Number);
  if (parts.length !== 4 || !parts.every(v => Number.isInteger(v) && v >= 0 && v <= 255) || !/^\d+\.\d+\.\d+\.\d+$/.test(raw)) return false;
  return parts[0] === 10 || parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31 || parts[0] === 192 && parts[1] === 168;
}
export function selectLanAddress(interfaces = networkInterfaces(), requested = '') {
  const addresses = Object.entries(interfaces).flatMap(([name, list]) => (list || []).filter(v => v.family === 'IPv4' && !v.internal && privateIPv4(v.address)).map(v => ({ name, address: v.address })));
  if (requested) {
    const selected = addresses.find(v => v.address === requested);
    if (!selected) throw new Error('CITY_V41_LAN_IP 必須是這台 Mac 目前網卡上的私人 IPv4 位址。');
    return selected;
  }
  // Prefer physical Ethernet/Wi-Fi adapters. Never silently bind every interface.
  const physical = addresses.filter(v => /^en\d+$/.test(v.name));
  const candidates = physical.length ? physical : addresses;
  const unique = candidates.filter((v, i) => candidates.findIndex(other => other.address === v.address) === i);
  if (unique.length !== 1) throw new Error(unique.length ? '找到多個區域網路位址，請用 CITY_V41_LAN_IP 指定與手機同網路的位址：' + unique.map(v => `${v.name}=${v.address}`).join('、') : '未找到私人 IPv4 網路；請先讓 Mac 與手機連上同一個 Wi-Fi，再重新啟動。');
  return unique[0];
}
