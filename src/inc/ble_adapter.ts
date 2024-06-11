const PRINT_CHARACTERISTIC = "0000ae01-0000-1000-8000-00805f9b34fb";
const NOTIFY_CHARACTERISTIC = "0000ae02-0000-1000-8000-00805f9b34fb";

export interface BleDevice {
  device: BluetoothDevice,
  print_characteristic: BluetoothRemoteGATTCharacteristic,
  notify_characteristic: BluetoothRemoteGATTCharacteristic
}

export const connect = async (device: BluetoothDevice): Promise<BleDevice> => {
  return new Promise<BleDevice>(async (resolve, reject) => {
    let notify_characteristic: BluetoothRemoteGATTCharacteristic | undefined = undefined
    let printer_characteristic: BluetoothRemoteGATTCharacteristic | undefined = undefined
    try {
      const server = await device.gatt?.connect();
      const services = await server?.getPrimaryServices();

      if (!services) {
        throw new Error('Service not found');
      }
      for (const service of services) {
        console.log(service.uuid);
        
        const chars = await service.getCharacteristics();
        for (const char of chars) {
          console.log(" >>>" + char.uuid);
          
          if (char.uuid == NOTIFY_CHARACTERISTIC) {
            notify_characteristic = char;
          }
          if (char.uuid == PRINT_CHARACTERISTIC) {
            printer_characteristic = char;
          }
        }
      }

      if (
        printer_characteristic != undefined &&
        notify_characteristic != undefined
      ) {
        resolve({
          device: device,
          print_characteristic: printer_characteristic,
          notify_characteristic: notify_characteristic,
        });
      }
    } catch (err) {
      reject(err);
    }
  })
}

export const scan = async (): Promise<BleDevice> => {
  return new Promise<BleDevice>(async (resolve, reject) => {
    try {
      const device = await navigator.bluetooth.requestDevice({
        acceptAllDevices: true,
        optionalServices: [
          "0000ae30-0000-1000-8000-00805f9b34fb",
          "0000af30-0000-1000-8000-00805f9b34fb",
          "0000ae3a-0000-1000-8000-00805f9b34fb",
        ],
      });
      return resolve(await connect(device));
    } catch (err) {
      reject(err);
    }
  })
}
