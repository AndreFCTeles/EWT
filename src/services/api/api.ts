import delay from "../utils/delay";
import { Brand, STUB_BRANDS } from "../generalTypes";


export async function getBrands(): Promise<Brand[]> {
   // TODO: replace with real fetch('http://.../brands')
   await delay(150);
   return STUB_BRANDS.slice();
}

export async function createBrand(name: string): Promise<Brand> {
   // TODO: POST to API; for now return a stub id
   await delay(150);
   return { id: 'new-' + name.toLowerCase().replace(/\s+/g, '-'), name };
}
