import type { NextConfig } from "next";

import { fileURLToPath } from "node:url";

const nextConfig: NextConfig = {
  /* Depoda iki lockfile var (kök vanilla site + bu uygulama); Turbopack
     kökü yanlış tahmin ediyordu. Açıkça belirtiliyor. */
  turbopack: { root: fileURLToPath(new URL(".", import.meta.url)) },
  /* Cache Components: Next 16'nın önbellek modeli. Elle Cache-Control
     yazmıyoruz; önbelleklenecek şeyi 'use cache' + cacheLife belirliyor.
     PPR'yi de varsayılan yapıyor: statik kabuk hemen, dinamik parça akarak. */
  cacheComponents: true,
};

export default nextConfig;
