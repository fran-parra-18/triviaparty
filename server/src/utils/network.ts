import { networkInterfaces } from 'node:os';

const VIRTUAL_HINTS = /(vethernet|virtualbox|vmware|vmnet|hyper-v|wsl|docker|br-|veth|tailscale|zerotier|loopback|bluetooth|utun|awdl|llw)/i;

/**
 * Direcciones IPv4 de la red local, priorizando Wi-Fi/Ethernet sobre adaptadores virtuales
 * (WSL, Hyper-V, VirtualBox, Docker…), que no son accesibles desde un teléfono.
 */
export function getLanAddresses(): string[] {
  const found: { address: string; score: number }[] = [];
  for (const [name, infos] of Object.entries(networkInterfaces())) {
    for (const info of infos ?? []) {
      if (info.family !== 'IPv4' || info.internal) continue;
      if (info.address.startsWith('169.254.')) continue; // autoconfiguración sin DHCP
      let score = 0;
      if (VIRTUAL_HINTS.test(name)) score -= 10;
      if (/^(wi-?fi|wlan|wlp|en0|en1|eth|ethernet|enp|eno)/i.test(name)) score += 5;
      if (info.address.startsWith('192.168.')) score += 3;
      else if (info.address.startsWith('10.')) score += 2;
      else if (/^172\.(1[6-9]|2\d|3[01])\./.test(info.address)) score += 1;
      found.push({ address: info.address, score });
    }
  }
  return found.sort((a, b) => b.score - a.score).map((f) => f.address);
}
