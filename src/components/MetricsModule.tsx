import React, { useState } from 'react';
import { motion } from 'motion/react';
import { Activity } from 'lucide-react';

export function MetricsModule() {
  const [metricUrl, setMetricUrl] = useState("");
  const [metricToken, setMetricToken] = useState("");
  const [loading, setLoading] = useState(false);
  const [metrics, setMetrics] = useState<any[] | null>(null);

  const fetchMetrics = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!metricUrl || !metricToken) return;
    setLoading(true);
    try {
        const liveGscUrl = `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(metricUrl)}/searchAnalytics/query`;
        const res = await fetch(liveGscUrl, {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${metricToken.trim()}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                startDate: "2026-04-01",
                endDate: "2026-05-20",
                dimensions: ["query"],
                rowLimit: 8
            })
        });
        if (!res.ok) throw new Error("Status " + res.status);
        const result = await res.json();
        if (result && result.rows) {
            setMetrics(result.rows.map((r: any) => ({
                query: r.keys[0],
                clicks: r.clicks || 0,
                impressions: r.impressions || 0,
                position: Math.round(r.position || 0)
            })));
        } else {
            setMetrics([]);
        }
    } catch (err) {
        console.error(err);
        setMetrics(null);
    } finally {
        setLoading(false);
    }
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end border-b border-white/[0.08] pb-6 mb-8 gap-4">
        <div>
          <h2 className="text-4xl font-serif text-white tracking-wide">Метрики</h2>
          <p className="text-zinc-500 text-sm mt-2 font-light">Аналитика поиска и данные производительности</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
         <div className="glass-card p-8 flex flex-col space-y-6 lg:h-[70vh]">
            <span className="text-sm font-medium tracking-wide text-white border-b border-white/[0.05] pb-4 mb-2">Конфигурация API</span>
            <form onSubmit={fetchMetrics} className="space-y-4">
              <input required value={metricUrl} onChange={e => setMetricUrl(e.target.value)} placeholder="Целевой URL" className="w-full bg-transparent border border-white/10 rounded-2xl px-5 py-3 text-sm text-white outline-none focus:border-white/30 placeholder-zinc-600" />
              <input required type="password" value={metricToken} onChange={e => setMetricToken(e.target.value)} placeholder="OAuth Токен" className="w-full bg-transparent border border-white/10 rounded-2xl px-5 py-3 text-sm text-white outline-none focus:border-white/30 placeholder-zinc-600" />
              <button disabled={loading} type="submit" className="w-full btn-primary py-3.5 text-sm mt-2 disabled:opacity-50">
                 {loading ? "Синхронизация..." : "Запуск Телеметрии"}
               </button>
            </form>
         </div>

         <div className="lg:col-span-2 glass-card p-8 flex flex-col lg:h-[70vh]">
            <span className="text-sm font-medium tracking-wide text-white border-b border-white/[0.05] pb-4 mb-2">Позиции в Поиске</span>
            {!metrics ? (
               <div className="flex-1 flex flex-col items-center justify-center">
                  <p className="text-xs uppercase tracking-widest text-zinc-600">Ожидание подключения данных</p>
               </div>
            ) : (
               <div className="mt-4 overflow-x-auto flex-1 hide-scrollbar">
                 <table className="w-full text-left text-sm">
                   <thead>
                     <tr className="border-b border-white/10 text-zinc-500 font-medium">
                        <th className="py-4 px-2 font-medium">Запрос</th>
                        <th className="py-4 px-2 text-right font-medium">Клик.</th>
                        <th className="py-4 px-2 text-right font-medium">Показы</th>
                        <th className="py-4 px-2 text-right font-medium">Позиция</th>
                     </tr>
                   </thead>
                   <tbody className="divide-y divide-white/[0.05]">
                     {metrics.map((r, i) => (
                       <tr key={i} className="hover:bg-white/[0.02] text-zinc-300 transition-colors">
                         <td className="py-4 px-2 truncate max-w-[150px]">{r.query}</td>
                         <td className="py-4 px-2 text-right font-mono text-zinc-200">{r.clicks}</td>
                         <td className="py-4 px-2 text-right font-mono text-zinc-500">{r.impressions}</td>
                         <td className="py-4 px-2 text-right font-mono text-zinc-500">{r.position}</td>
                       </tr>
                     ))}
                   </tbody>
                 </table>
                 {metrics.length === 0 && <p className="text-center text-xs text-zinc-600 uppercase tracking-widest mt-12">Нет данных для отображения</p>}
               </div>
            )}
         </div>
      </div>
    </div>
  );
}
