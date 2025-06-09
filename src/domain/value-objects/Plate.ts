export class Plate {
  constructor(public readonly value: string) {
    if (!/^[A-Z]{3}[0-9][0-9A-Z][0-9]{2}$/.test(value)) {
      throw new Error('Invalid vehicle plate format.');
    }
  }

  toString() {
    return this.value;
  }
}