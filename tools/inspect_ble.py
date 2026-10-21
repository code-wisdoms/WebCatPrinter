"""Inventory BLE services and capture known, non-printing Cat protocol queries."""
import argparse
import asyncio
import json
from datetime import datetime, timezone
from pathlib import Path

from bleak import BleakClient, BleakScanner


def packet(command):
    return bytes([0x51, 0x78, command, 0, 1, 0, 0, 0, 0xff])


async def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--address', help='Exact address from scan; omit to scan only')
    parser.add_argument('--output', default='diagnostics/ble-inventory.json')
    parser.add_argument('--queries', action='store_true', help='Send only A3 state and A8 info queries on AE01')
    args = parser.parse_args()
    found = await BleakScanner.discover(timeout=10, return_adv=True)
    inventory = [{'address': d.address, 'name': d.name, 'local_name': a.local_name,
                  'rssi': a.rssi, 'services': a.service_uuids,
                  'manufacturer_data': {str(k): v.hex() for k, v in a.manufacturer_data.items()}}
                 for d, a in found.values()]
    report = {'captured_utc': datetime.now(timezone.utc).isoformat(), 'advertisements': inventory}
    print(json.dumps(inventory, indent=2), flush=True)
    if args.address:
        target = next((d for d, _ in found.values() if d.address.lower() == args.address.lower()), None)
        if target is None:
            raise RuntimeError('Target not advertising; close other printer apps and retry')
        async with BleakClient(target, timeout=20) as client:
            report['target'] = args.address
            report['services'] = []
            report['notifications'] = []
            def notify(char, value):
                entry = {'utc': datetime.now(timezone.utc).isoformat(), 'uuid': char.uuid, 'hex': bytes(value).hex()}
                report['notifications'].append(entry)
                print('RX', entry, flush=True)
            for service in client.services:
                item = {'uuid': service.uuid, 'description': service.description, 'characteristics': []}
                report['services'].append(item)
                for char in service.characteristics:
                    c = {'uuid': char.uuid, 'properties': char.properties, 'descriptors': []}
                    item['characteristics'].append(c)
                    for descriptor in char.descriptors:
                        c['descriptors'].append({'uuid': descriptor.uuid, 'handle': descriptor.handle})
                    if 'read' in char.properties:
                        try:
                            value = bytes(await client.read_gatt_char(char))
                            c['read_hex'] = value.hex()
                            c['read_text'] = value.decode('utf-8', errors='replace')
                        except Exception as exc:
                            c['read_error'] = str(exc)
                    if 'notify' in char.properties or 'indicate' in char.properties:
                        try:
                            await client.start_notify(char, notify)
                        except Exception as exc:
                            c['notify_error'] = str(exc)
            # These queries apply only to the AE30 legacy protocol family.
            service = client.services.get_service('0000ae30-0000-1000-8000-00805f9b34fb')
            if service and args.queries:
                tx = service.get_characteristic('0000ae01-0000-1000-8000-00805f9b34fb')
                if tx:
                    report['queries'] = []
                    for command in (0xa3, 0xa8):
                        data = packet(command)
                        report['queries'].append(data.hex())
                        await client.write_gatt_char(tx, data, response='write' in tx.properties)
                        await asyncio.sleep(2)
            await asyncio.sleep(3)
    path = Path(args.output)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(report, indent=2), encoding='utf-8')
    print('Saved', path, flush=True)


if __name__ == '__main__':
    asyncio.run(main())
