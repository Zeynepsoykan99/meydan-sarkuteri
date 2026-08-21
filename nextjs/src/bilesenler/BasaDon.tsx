"use client";

import { useEffect, useState } from "react";

/* Başa dön butonu. 470 kartlık bir listede aşağı kaydıran ziyaretçi
   başa dönmek istediğinde faydalı. İlk ekrandan çıkıldığında görünür,
   tıklanınca yumuşak kaydırma ile başa döner.

   IntersectionObserver kullanıyor: scroll olayı dinlemekten çok daha
   verimli — tarayıcı paint'i kendi döngüsünde bildiriyor. */
export default function BasaDon() {
  const [gorunur, setGorunur] = useState(false);

  useEffect(() => {
    /* Tente'yi gözlemliyoruz — sayfanın en üstündeki kırmızı-beyaz şerit.
       Tente görünümden çıktığında buton görünür. */
    const hedef = document.querySelector(".tente");
    if (!hedef) return;

    const io = new IntersectionObserver(
      ([e]) => setGorunur(!e.isIntersecting),
      { threshold: 0 },
    );
    io.observe(hedef);
    return () => io.disconnect();
  }, []);

  if (!gorunur) return null;

  return (
    <button
      type="button"
      onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
      aria-label="Başa dön"
      className="fixed bottom-6 right-6 z-50 grid size-12 place-items-center
                 rounded-full border-[1.5px] border-cizgi bg-beyaz text-murekkep
                 shadow-tezgah transition-all hover:border-murekkep hover:shadow-kalk
                 hover:-translate-y-0.5 active:scale-95
                 animate-[basa-don-gir_0.3s_ease_both]"
    >
      <svg viewBox="0 0 24 24" className="size-5 fill-none stroke-current stroke-[2.5]">
        <path d="M12 19V5m0 0-6 6m6-6 6 6" />
      </svg>
    </button>
  );
}
