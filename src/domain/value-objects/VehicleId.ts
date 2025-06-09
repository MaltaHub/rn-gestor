export class VehicleId {
  constructor(public readonly value: string) {
    if (!value || !/^[a-f0-9-]{36}$/.test(value)) {
      throw new Error('Invalid vehicle ID format.');
    }
  }

  toString() {
    return this.value;
  }
}
