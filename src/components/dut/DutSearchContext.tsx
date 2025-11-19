// src/checklist/DutSearchContext.tsx
import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import type { DutProfile } from '@/types/dutProfileTypes';
import { loadDutProfiles } from '@/services/api/dut/dutProfilesRepo';

export type DutFilter = {
   brand?: string;
   categoryMain?: string;
   categorySub?: string;
   categorySubSub?: string;
   format?: string;
   text?: string;
};

type CtxValue = {
   loading: boolean;
   all: DutProfile[];
   filtered: DutProfile[];
   filter: DutFilter;
   setFilter: (patch: Partial<DutFilter>) => void;

   page: number;
   pageSize: number;
   setPage: (p: number) => void;

   onSelect: (p: DutProfile) => void;
};

const Ctx = createContext<CtxValue | null>(null);

function normalize(s?: string) {
   return (s ?? '')
      .normalize('NFD')
      .replace(/\p{Diacritic}/gu, '')
      .toLowerCase();
}

export function DutSearchProvider({
   children,
   onSelect,
   pageSize = 20,
}: {
   children: React.ReactNode;
   onSelect: (p: DutProfile) => void;
   pageSize?: number;
}) {
   const [all, setAll] = useState<DutProfile[]>([]);
   const [loading, setLoading] = useState(true);
   const [filter, setFilterState] = useState<DutFilter>({});
   const [page, setPage] = useState(1);

   useEffect(() => {
      let alive = true;
      (async () => {
         setLoading(true);
         try {
            const profiles = await loadDutProfiles();
            if (alive) setAll(profiles);
         } finally { if (alive) setLoading(false); }
      })();
      return () => { alive = false; };
   }, []);

   const filtered = useMemo(() => {
      const nBrand = normalize(filter.brand);
      const nText = normalize(filter.text);
      return all.filter(p => {
         if (filter.categoryMain && p.categoryMain !== filter.categoryMain) return false;
         if (filter.categorySub && p.categorySub !== filter.categorySub) return false;
         if (filter.categorySubSub && p.categorySubSub !== filter.categorySubSub) return false;
         if (filter.format && p.format !== filter.format) return false;
         if (nBrand && normalize(p.brand) !== nBrand) return false;
         if (nText) {
            const hay = normalize(`${p.brand} ${p.prodName} ${p.series ?? ''}`);
            if (!hay.includes(nText)) return false;
         }
         return true;
      });
   }, [all, filter]);

   const setFilter = (patch: Partial<DutFilter>) => {
      setFilterState(prev => ({ ...prev, ...patch }));
      setPage(1); // reset pagination when filters change
   };

   const value: CtxValue = {
      loading,
      all,
      filtered,
      filter,
      setFilter,
      page,
      pageSize,
      setPage,
      onSelect,
   };

   return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useDutSearch() {
   const ctx = useContext(Ctx);
   if (!ctx) throw new Error('useDutSearch must be used inside DutSearchProvider');
   return ctx;
}
