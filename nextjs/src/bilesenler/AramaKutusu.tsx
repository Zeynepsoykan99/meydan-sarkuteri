"use client";

import { useKatalogDurumu } from "./KatalogDurumu";

export default function AramaKutusu() {
  const { arama, aramaYaz } = useKatalogDurumu();

  return (
    <form
      className="arama relative flex w-full max-w-[520px] items-center justify-self-center"
      role="search"
      onSubmit={(e) => e.preventDefault()}
    >
      <svg viewBox="0 0 20 20" aria-hidden="true"
           className="pointer-events-none absolute left-[15px] size-[19px] fill-none
                      stroke-murekkep-soluk stroke-2 [stroke-linecap:round]">
        <circle cx="9" cy="9" r="6" /><path d="M13.5 13.5 18 18" />
      </svg>
      <input
        id="arama" type="search" autoComplete="off" aria-label="Ürün ara"
        placeholder="Ürün ara — peynir, zeytin, süt…"
        value={arama}
        onChange={(e) => aramaYaz(e.target.value)}
      />
      {arama && (
        <button
          type="button" aria-label="Aramayı temizle"
          onClick={() => aramaYaz("")}
          className="absolute right-2 size-[30px] rounded-full border-0 bg-murekkep
                     text-xs leading-none text-beyaz"
        >
          ✕
        </button>
      )}
    </form>
  );
}
