// Zustand der Station und der App für die Stationsseite
import { weewx, getStatus } from './db.js';
import { cleanRow, correctionList } from './corrections.js';
import { archiveSpan } from './weather.js';

const stCount = weewx.prepare('SELECT COUNT(*) AS n FROM archive');
const stHealth = weewx.prepare(`SELECT usUnits, AVG(rxCheckPercent) AS rxCheckPercent, MAX(txBatteryStatus) AS txBatteryStatus,
  AVG(inTemp) AS inTemp, COUNT(*) AS records FROM archive WHERE dateTime > ?`);

export function stationStatus() {
  const span = archiveSpan();
  const day = span.last ? cleanRow(stHealth.get(span.last - 86400)) : null;
  const job = (key) => getStatus(key)?.updated ?? null;
  return {
    first: span.first,
    last: span.last,
    records: stCount.get().n,
    last24h: day && {
      records: day.records,
      rxCheckPercent: day.rxCheckPercent,
      batteryLow: day.txBatteryStatus > 0,
      receiverTemp: day.inTemp,
    },
    jobs: { lake: job('see'), storm: job('sturm') },
    corrections: correctionList(),
  };
}
