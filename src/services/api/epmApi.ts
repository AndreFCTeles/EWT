import type { ProductData, Category } from '@/types/productTypes'; // shared or codegen

export async function fetchProducts(baseUrl: string): Promise<ProductData[]> {
   const r = await fetch(`${baseUrl}/epm/getProducts`);
   const j = await r.json();
   return j.products ?? [];
}

export async function fetchCategories(baseUrl: string): Promise<Category[]> {
   const r = await fetch(`${baseUrl}/epm/getCategoriesMongoose`); // preferred per your backend
   const j = await r.json();
   return j.categories ?? [];
}

export async function fetchUniqueSeries(baseUrl: string): Promise<Array<{label:string; value:string}>> {
   const r = await fetch(`${baseUrl}/epm/getUniqueSeries`);
   const j = await r.json();
   return j.seriesData ?? [];
}

// Derive unique brands from products (no dedicated endpoint yet)
export async function fetchBrands(baseUrl: string): Promise<string[]> {
   const products = await fetchProducts(baseUrl);
   return [...new Set(products.map(p => (p.brand || '').trim()).filter(Boolean))].sort();
}
