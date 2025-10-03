export interface ProductData {
   _id?: string;
   prodName: string;
   brand: string;
   series?: string;
   category: ProdCategory;
   format?: ProdCategory;
   technical: TechnicalData[];
   description: string;
   applications: string;
   functions?: FuncData[];
   images?: ImageData[];
   createdDate?: string;
   updatedDate?: string;
};
export interface ImageData {
   imageName: string;
   imagePath: string;
   thumbnailName: string;
   thumbnailPath: string;
   thumbnail?: string;
};
export interface FuncData {
   _id?: string;
   label: string;
   value: string;
   desc: string;
   icnPath?: string;
   cat?: SelectDDData[];
};
export interface ProdCategory {
   main: string;
   sub?: ProdCategory;
   format?: string;
};
export interface Category {
   _id?: string;
   label: string;
   value: string;
   technical?: string[];
   subCategories?: Category[];
   format?: Format[];
};
export interface Format {
   label: string;
   value: string;
   technical?: string[];
};
export interface TechnicalData {
   field: string;
   value?: string;
   suf?: string;
};
export interface SeriesData {
   label: string;
   value: string;
};
export interface SelectDDData {
   label: string;
   value: string;
};
