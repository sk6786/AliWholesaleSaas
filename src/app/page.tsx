'use client';

import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { mockLeads, mockOrders, Lead, Order } from '../data/mockData';
import {
  MapPin, Package, Truck, TrendingUp, AlertCircle, Phone,
  CheckCircle2, History, X, Navigation, Inbox, Calendar, LayoutDashboard, Users, Map as MapIcon, Settings, Loader2, ShieldAlert, Ban, RefreshCw, PhoneForwarded
} from 'lucide-react';

const HQ = { lat: 40.7265, lng: -73.7025 };
const MAX_TRUCK_WEIGHT = 2500;

function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 3958.8;
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function estimateOrderAmount(lead: Lead): number {
  const primaryWeight = parseInt(lead.favoredProduct.match(/(\d+)/)?.[0] || '50');
  const secondaryWeight = parseInt(lead.secondaryProduct.match(/(\d+)/)?.[0] || '25');
  return (primaryWeight + secondaryWeight) * 3;
}

// Nearest-neighbor stop ordering from HQ
function optimizeStopOrder(orders: Order[]): Order[] {
  if (orders.length <= 1) return orders.map((o, i) => ({ ...o, stopNumber: i + 1 }));
  const remaining = [...orders];
  const ordered: Order[] = [];
  let currentLat = HQ.lat;
  let currentLng = HQ.lng;

  while (remaining.length > 0) {
    let nearestIdx = 0;
    let nearestDist = Infinity;
    for (let i = 0; i < remaining.length; i++) {
      const d = calculateDistance(currentLat, currentLng, remaining[i].lat, remaining[i].lng);
      if (d < nearestDist) {
        nearestDist = d;
        nearestIdx = i;
      }
    }
    const next = remaining.splice(nearestIdx, 1)[0];
    ordered.push({ ...next, stopNumber: ordered.length + 1 });
    currentLat = next.lat;
    currentLng = next.lng;
  }
  return ordered;
}

const keywords = ['Sesame', 'Raisins', 'Chilies', 'Cinnamon', 'Poppy', 'Nuts', 'Dried Fruits', 'Walnuts', 'Almonds', 'Hazelnuts', 'Cashews'];
const negativeKeywords = ['Price', '$2.50'];

function HighlightedText({ text }: { text: string }) {
  const parts = text.split(/(\$?\d+\.\d+|[A-Z][a-z]+)/g);
  return (
    <>
      {parts.map((part, i) => {
        if (keywords.includes(part)) {
          return <span key={i} className="bg-amber-100 text-amber-700 font-bold px-1.5 py-0.5 rounded-md mx-0.5">{part}</span>;
        }
        if (negativeKeywords.includes(part)) {
          return <span key={i} className="bg-red-100 text-red-700 font-bold px-1.5 py-0.5 rounded-md mx-0.5">{part}</span>;
        }
        return part;
      })}
    </>
  );
}

export default function WholesaleDashboard() {
  const [leads, setLeads] = useState<Lead[]>(mockLeads);
  const [orders, setOrders] = useState<Order[]>(mockOrders);
  const [isCalling, setIsCalling] = useState(false);
  const [callPhase, setCallPhase] = useState<'idle' | 'connecting' | 'streaming' | 'calculating' | 'summary' | 'credit_block' | 'live_transfer'>('idle');
  const [transcription, setTranscription] = useState<{ role: 'ai' | 'customer'; text: string }[]>([]);
  const [activeLeadId, setActiveLeadId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [highMarginOnly, setHighMarginOnly] = useState(false);
  const [lastCallOutcome, setLastCallOutcome] = useState<{ lead: Lead; status: string; extraction: string; creditBlocked?: boolean; creditDetails?: { limit: number; outstanding: number; orderAmount: number } } | null>(null);
  const [showTranscriptAudit, setShowTranscriptAudit] = useState(false);
  const [dialingName, setDialingName] = useState('');
  const [isNegativeSentiment, setIsNegativeSentiment] = useState(false);
  const isNegativeSentimentRef = useRef(false);
  const [isTakenOver, setIsTakenOver] = useState(false);
  const isTakenOverRef = useRef(false);
  const [activeTab, setActiveTab] = useState<'incoming' | 'fulfillment' | 'drip'>('incoming');
  const [routeRefreshKey, setRouteRefreshKey] = useState(0);
  const [sidebarPage, setSidebarPage] = useState<'dashboard' | 'leads' | 'routes' | 'analytics'>('dashboard');

  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  const accessibleLeads = useMemo(() => {
    return leads
      .map(lead => ({ ...lead, distance: calculateDistance(HQ.lat, HQ.lng, lead.lat, lead.lng) }))
      .filter(lead => {
        if (activeTab === 'incoming') return lead.status === 'Incoming Queue' || lead.status === 'Ready';
        if (activeTab === 'drip') return lead.status === 'Drip';
        return false;
      })
      .filter(lead => !highMarginOnly || lead.marginPotential === 'High')
      .sort((a, b) => a.distance - b.distance);
  }, [leads, highMarginOnly, activeTab]);

  // Build fulfillment orders from leads marked as 'Fulfilled' plus any manually added orders
  const fulfillmentOrders = useMemo(() => {
    return orders.filter(o => o.route);
  }, [orders]);

  // Build routes with optimized stop ordering (recalculates on routeRefreshKey change)
  const routes = useMemo(() => {
    const groups: Record<string, Order[]> = {};
    fulfillmentOrders.forEach(order => {
      const r = order.route || 'Unassigned';
      if (!groups[r]) groups[r] = [];
      groups[r].push(order);
    });
    return Object.entries(groups).map(([name, items]) => {
      const optimized = optimizeStopOrder(items);
      return {
        name,
        items: optimized,
        totalWeight: optimized.reduce((sum, o) => sum + o.weight_lbs, 0)
      };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fulfillmentOrders, routeRefreshKey]);

  // Staging area: orders that have been accepted but not yet routed
  const stagingOrders = useMemo(() => {
    return orders.filter(o => !o.route);
  }, [orders]);

  const checkCreditLimit = (lead: Lead): { passed: boolean; limit: number; outstanding: number; orderAmount: number } => {
    const orderAmount = estimateOrderAmount(lead);
    if (!lead.creditAccount) {
      return { passed: true, limit: 0, outstanding: 0, orderAmount };
    }
    const { creditLimit, outstandingBalance, isFrozen } = lead.creditAccount;
    if (isFrozen) {
      return { passed: false, limit: creditLimit, outstanding: outstandingBalance, orderAmount };
    }
    const newTotal = outstandingBalance + orderAmount;
    return { passed: newTotal <= creditLimit, limit: creditLimit, outstanding: outstandingBalance, orderAmount };
  };

  const handleRefreshRoutes = useCallback(() => {
    // Re-optimize all routes by bumping the refresh key
    setRouteRefreshKey(prev => prev + 1);
    setToast('Routes recalculated with optimized stop order');
  }, []);

  const handleCall = async (lead: Lead) => {
    if (isCalling) return;
    setIsCalling(true);
    setActiveLeadId(lead.id);
    setDialingName(lead.name);
    setCallPhase('connecting');
    setTranscription([]);
    setLastCallOutcome(null);
    setShowTranscriptAudit(false);
    setIsNegativeSentiment(false);
    isNegativeSentimentRef.current = false;
    setIsTakenOver(false);
    isTakenOverRef.current = false;

    // Phase 1: Connecting
    await new Promise(r => setTimeout(r, 2000));

    // Phase 2: Streaming
    setCallPhase('streaming');
    let script: { role: 'ai' | 'customer'; text: string }[] = [];
    let finalStatus: Lead['status'] = 'Ready';

    if (lead.name === 'Hempstead Hearth') {
      script = [
        { role: 'ai', text: 'Hi, this is Ali\'s Wholesale. We have a special on bulk Walnuts this week.' },
        { role: 'customer', text: 'Your walnut price is too high; I\'m getting it for $2.50 elsewhere.' },
        { role: 'ai', text: 'I understand your concern about the pricing. Let me transfer you to my manager who can discuss a custom rate. One moment please.' }
      ];
      finalStatus = 'Escalated';
    } else if (lead.name === 'The Rolling Pin') {
      script = [
        { role: 'ai', text: 'Hi, this is Ali\'s Wholesale. We noticed your order for The Rolling Pin is overdue. Would you like to restock?' },
        { role: 'customer', text: 'Finally! I\'ve been waiting for a call. Your last delivery was late and I\'m very angry. If this happens again, I\'m going to cancel my account!' },
        { role: 'ai', text: 'I completely understand your frustration and I\'m sorry about that. Hold on, I\'m transferring you to my manager right now.' }
      ];
      finalStatus = 'Escalated';
    } else if (lead.name === 'Old World Bakery') {
      script = [
        { role: 'ai', text: 'Hi, this is Ali\'s Wholesale. We have premium Raisins and Walnuts on special this week. Want to place an order?' },
        { role: 'customer', text: 'Actually yes! We need 150lb of Raisins and 75lb of Walnuts. Can you deliver tomorrow?' },
        { role: 'ai', text: 'Absolutely! 150lb Raisins and 75lb Walnuts confirmed for tomorrow\'s delivery. Thank you!' }
      ];
      finalStatus = 'Ready';
    } else if (lead.name === 'Bellmore Bread House') {
      script = [
        { role: 'ai', text: 'Hi, this is Ali\'s Wholesale. We have fresh Almonds and Hazelnuts available. Can we set up a delivery?' },
        { role: 'customer', text: 'Yes please! I need 75lb of Almonds and 50lb of Hazelnuts for our new recipe line.' },
        { role: 'ai', text: 'Great choice! Let me process that order for 75lb Almonds and 50lb Hazelnuts right away.' }
      ];
      finalStatus = 'Ready';
    } else {
      const rand = Math.random();
      if (rand < 0.35) {
        script = [
          { role: 'ai', text: 'Hi, this is Ali\'s Wholesale. We\'re in your area tomorrow. Do you need a restock?' },
          { role: 'customer', text: 'Yes! We actually ran out of Sesame seeds. Can you bring 50lb? And let\'s add 25lb of Raisins and some Chilies for our spicy loaf.' },
          { role: 'ai', text: 'Great, we\'ll have those Sesame seeds, Raisins, and Chilies with you tomorrow. Thank you!' }
        ];
      } else if (rand < 0.7) {
        script = [
          { role: 'ai', text: 'Hi, this is Ali\'s Wholesale. Checking in for your weekly Cinnamon and Poppy seed order.' },
          { role: 'customer', text: 'Perfect timing. We need 100lb of Cinnamon and let\'s try 50lb of those new Nuts you mentioned.' },
          { role: 'ai', text: 'Got it. 100lb Cinnamon and 50lb Nuts recorded. We\'ll see you tomorrow. Thank you!' }
        ];
      } else {
        script = [
          { role: 'ai', text: 'Hi, this is Ali\'s Wholesale. We\'re in your area tomorrow with great prices on bulk seeds and nuts. Interested in a delivery?' },
          { role: 'customer', text: 'Not right now, thanks. We\'re fully stocked for the next few weeks. Maybe check back next month?' },
          { role: 'ai', text: 'No problem at all! I\'ll follow up with you in 30 days. Have a great day!' }
        ];
        finalStatus = 'Drip';
      }
    }

    for (const line of script) {
      if (isTakenOverRef.current) break;
      setTranscription(prev => [...prev, line]);
      
      // Sentiment Detection — triggers live transfer instead of banner
      if (['angry', 'upset', 'cancel'].some(k => line.text.toLowerCase().includes(k))) {
        setIsNegativeSentiment(true);
        isNegativeSentimentRef.current = true;
      }

      const startTime = Date.now();
      while (Date.now() - startTime < 3500) {
        if (isTakenOverRef.current) {
          setIsCalling(false);
          setActiveLeadId(null);
          return;
        }
        await new Promise(r => setTimeout(r, 100));
      }
    }

    // If negative sentiment detected, transition to LIVE TRANSFER state (not a banner)
    if (isNegativeSentimentRef.current && !isTakenOverRef.current) {
      setCallPhase('live_transfer');
      setIsCalling(false);
      return;
    }

    // Phase 3: Calculating
    setCallPhase('calculating');
    await new Promise(r => setTimeout(r, 1500));

    // Phase 4: Summary
    if (!isTakenOverRef.current) {
      // Credit limit check
      if (finalStatus === 'Ready') {
        const creditCheck = checkCreditLimit(lead);
        if (!creditCheck.passed) {
          setCallPhase('credit_block');
          setLastCallOutcome({
            lead,
            status: 'Escalated',
            extraction: `${lead.favoredProduct} + ${lead.secondaryProduct}`,
            creditBlocked: true,
            creditDetails: {
              limit: creditCheck.limit,
              outstanding: creditCheck.outstanding,
              orderAmount: creditCheck.orderAmount,
            }
          });
          setIsCalling(false);
          setActiveLeadId(null);
          return;
        }
      }

      // Drip enrollment
      if (finalStatus === 'Drip') {
        setCallPhase('summary');
        const nextDate = new Date();
        nextDate.setDate(nextDate.getDate() + 30);
        setLeads(prev => prev.map(l => l.id === lead.id ? { ...l, status: 'Drip', nextContactDate: nextDate.toISOString().split('T')[0] } : l));
        setLastCallOutcome({
          lead,
          status: 'Drip',
          extraction: 'Not interested — enrolled in 30-day drip campaign'
        });
        setToast(`${lead.name} enrolled in Drip Campaign`);
        setIsCalling(false);
        setActiveLeadId(null);
        return;
      }

      // Price conflict escalation (Hempstead Hearth) — AI already said "transferring to manager"
      if (finalStatus === 'Escalated') {
        setCallPhase('live_transfer');
        setLeads(prev => prev.map(l => l.id === lead.id ? { ...l, status: 'Escalated' } : l));
        setIsCalling(false);
        setActiveLeadId(null);
        return;
      }

      setCallPhase('summary');
      setLeads(prev => prev.map(l => l.id === lead.id ? { ...l, status: finalStatus } : l));
      setLastCallOutcome({ lead, status: finalStatus, extraction: `${lead.favoredProduct} + ${lead.secondaryProduct}` });
      if (finalStatus === 'Ready') setToast('Order Ready — Accept Order');
      setIsCalling(false);
      setActiveLeadId(null);
    }
  };

  const handleAcceptAndRoute = (lead: Lead) => {
    const newOrder: Order = {
      id: `ORD-${Math.random().toString(36).substr(2, 6).toUpperCase()}`,
      customerName: lead.name,
      items: `${lead.favoredProduct} + ${lead.secondaryProduct}`,
      weight_lbs: parseInt(lead.favoredProduct.match(/(\d+)/)?.[0] || '50') + parseInt(lead.secondaryProduct.match(/(\d+)/)?.[0] || '25'),
      city: lead.city,
      lat: lead.lat,
      lng: lead.lng,
      route: '',
      status: 'Ready',
      stopNumber: 0
    };
    setOrders(prev => [...prev, newOrder]);
    setLeads(prev => prev.map(l => l.id === lead.id ? { ...l, status: 'Not Interested' } : l));
    setToast(`${lead.name} accepted → staged for fulfillment`);
    setLastCallOutcome(null);
    setCallPhase('idle');
    setActiveTab('fulfillment');
  };

  const handleGenerateRoutes = () => {
    setOrders(prev => prev.map(o => {
      if (!o.route) {
        const routeName = o.city === 'Mineola' ? 'Mineola Loop' : o.city === 'Garden City' ? 'Garden City Loop' : `${o.city} Loop`;
        return { ...o, route: routeName, status: 'Routed' as const };
      }
      return o;
    }));
    setRouteRefreshKey(prev => prev + 1);
    setToast('Routes generated — all staged orders assigned to routes');
  };

  const handleRouteStagingOrder = (orderId: string, city: string) => {
    const routeName = city === 'Mineola' ? 'Mineola Loop' : city === 'Garden City' ? 'Garden City Loop' : `${city} Loop`;
    setOrders(prev => prev.map(o => o.id === orderId ? { ...o, route: routeName, status: 'Routed' as const } : o));
    setRouteRefreshKey(prev => prev + 1);
    setToast(`Routed to ${routeName}`);
  };

  const handleTakeOverCall = () => {
    isTakenOverRef.current = true;
    setIsTakenOver(true);
    setIsCalling(false);
    if (activeLeadId) {
      setLeads(prev => prev.map(l => l.id === activeLeadId ? { ...l, status: 'Escalated' } : l));
    }
    setCallPhase('idle');
    setIsNegativeSentiment(false);
    setToast('Call transferred — Ali is now on the line');
    setActiveLeadId(null);
  };

  const StatusPill = ({ status, labelOverride }: { status: string, labelOverride?: string }) => {
    const map: Record<string, { bg: string, dot: string, text: string, label: string }> = {
      'Incoming Queue': { bg: 'bg-zinc-100', dot: 'bg-zinc-400', text: 'text-zinc-600', label: 'INCOMING' },
      'Ready': { bg: 'bg-emerald-50', dot: 'bg-emerald-500', text: 'text-emerald-700', label: 'READY' },
      'Follow-up': { bg: 'bg-amber-50', dot: 'bg-amber-500', text: 'text-amber-700', label: 'FOLLOW-UP' },
      'Escalated': { bg: 'bg-rose-50', dot: 'bg-rose-500', text: 'text-rose-700', label: 'ESCALATE' },
      'Not Interested': { bg: 'bg-zinc-50', dot: 'bg-zinc-300', text: 'text-zinc-400', label: 'DECLINED' },
      'Drip': { bg: 'bg-blue-50', dot: 'bg-blue-500', text: 'text-blue-700', label: 'FOLLOW UP' },
    };
    const c = map[status] || map['Incoming Queue'];
    return (
      <div className={`${c.bg} ${c.text} px-3 py-1 rounded-full border border-zinc-200/50 flex items-center text-[8px] font-black tracking-widest`}>
        <div className={`w-1 h-1 ${c.dot} rounded-full mr-2`} /> {labelOverride || c.label}
      </div>
    );
  };

  return (
    <div className="flex h-screen bg-white text-zinc-900 font-sans overflow-hidden">
      <style jsx global>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap');
        body { font-family: 'Inter', sans-serif; -webkit-font-smoothing: antialiased; }
        .custom-scrollbar::-webkit-scrollbar { width: 4px; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #e4e4e7; border-radius: 10px; }
        .pulsing { animation: pulse 2s infinite; }
        @keyframes pulse { 0% { opacity: 1; transform: scale(1); } 50% { opacity: 0.5; transform: scale(1.1); } 100% { opacity: 1; transform: scale(1); } }
      `}</style>

      {/* Sidebar */}
      <aside className="w-64 bg-zinc-900 border-r border-zinc-800 flex flex-col shrink-0 text-zinc-400">
        <div className="p-8 pb-12">
          <div className="flex items-center space-x-3 mb-10">
            <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center font-black text-white italic">A</div>
            <span className="text-white font-bold tracking-tight text-xl">ALI WHOLESALE</span>
          </div>
          <nav className="space-y-1">
            {[{ l: 'Dashboard', i: LayoutDashboard, k: 'dashboard' as const }, { l: 'Leads', i: Users, k: 'leads' as const }, { l: 'Routes', i: MapIcon, k: 'routes' as const }, { l: 'Analytics', i: TrendingUp, k: 'analytics' as const }].map(item => (
              <button key={item.l} onClick={() => setSidebarPage(item.k)} className={`flex items-center space-x-3 px-4 py-3 w-full rounded-xl transition-all ${sidebarPage === item.k ? 'bg-zinc-800 text-white' : 'hover:bg-zinc-800/50'}`}>
                <item.i size={18} /> <span className="text-sm font-semibold">{item.l}</span>
              </button>
            ))}
          </nav>
        </div>
        <div className="mt-auto p-8 border-t border-zinc-800 flex items-center space-x-2 text-[10px]">
          <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />
          <span className="font-black uppercase tracking-widest opacity-40">VAPI ENGINE ACTIVE</span>
        </div>
      </aside>

      <div className="flex-1 flex flex-col relative">
        {/* Header */}
        <header className="h-16 border-b border-zinc-200 flex items-center justify-between px-10">
          <div>
            <h1 className="text-sm font-black text-zinc-900 uppercase italic">{sidebarPage === 'dashboard' ? 'Western Long Island' : sidebarPage === 'leads' ? 'Lead Pipeline' : sidebarPage === 'routes' ? 'Route Management' : 'Analytics & Insights'}</h1>
            <p className="text-[9px] text-zinc-400 font-bold uppercase tracking-widest">{sidebarPage === 'dashboard' ? 'Mineola Hub Cluster' : sidebarPage === 'leads' ? 'All Territories' : sidebarPage === 'routes' ? 'Fleet Operations' : 'Performance Metrics'}</p>
          </div>
          {sidebarPage === 'dashboard' && (
            <button onClick={() => setHighMarginOnly(!highMarginOnly)} className={`flex items-center space-x-2 px-3 py-1.5 rounded-lg border text-[9px] font-black uppercase tracking-widest ${highMarginOnly ? 'bg-amber-50 border-amber-200 text-amber-600' : 'border-zinc-200 text-zinc-400'}`}>
              <TrendingUp size={12} /> <span>High Margins Only</span>
            </button>
          )}
        </header>

        {/* Placeholder Pages */}
        {sidebarPage !== 'dashboard' && (
          <main className="flex-1 flex items-center justify-center bg-zinc-50">
            <div className="text-center max-w-lg px-8">
              <div className="w-16 h-16 mx-auto mb-6 rounded-2xl bg-zinc-100 border border-zinc-200 flex items-center justify-center">
                {sidebarPage === 'leads' && <Users size={28} className="text-zinc-400" />}
                {sidebarPage === 'routes' && <MapIcon size={28} className="text-zinc-400" />}
                {sidebarPage === 'analytics' && <TrendingUp size={28} className="text-zinc-400" />}
              </div>
              <h2 className="text-lg font-black text-zinc-900 mb-2">
                {sidebarPage === 'leads' && 'Full Lead Pipeline'}
                {sidebarPage === 'routes' && 'Route Optimization Dashboard'}
                {sidebarPage === 'analytics' && 'Call & Revenue Analytics'}
              </h2>
              <p className="text-sm text-zinc-500 mb-6 leading-relaxed">
                {sidebarPage === 'leads' && 'Complete lead management with Google Maps scraper integration, PostGIS geofence visualization, and pipeline stages from NEW through CONVERTED. Includes bulk import, deduplication, and territory assignment.'}
                {sidebarPage === 'routes' && 'Full vehicle routing with Google Maps API integration, real-time driver tracking, multi-territory management, and automated manifest generation. Includes drag-and-drop stop reordering and capacity optimization.'}
                {sidebarPage === 'analytics' && 'Conversion funnel metrics, revenue per route, AI call success rates, drip campaign performance, and credit utilization dashboards. Includes daily/weekly/monthly trend analysis and territory comparisons.'}
              </p>
              <div className="inline-flex items-center space-x-2 bg-zinc-100 border border-zinc-200 rounded-xl px-4 py-2.5">
                <div className="w-2 h-2 bg-blue-500 rounded-full" />
                <span className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">
                  {sidebarPage === 'leads' && 'Roadmap: Phase 1-2 (Months 1-2)'}
                  {sidebarPage === 'routes' && 'Roadmap: Phase 4 (Month 5)'}
                  {sidebarPage === 'analytics' && 'Roadmap: Phase 5 (Month 6)'}
                </span>
              </div>
              <div className="mt-6">
                <button onClick={() => setSidebarPage('dashboard')} className="text-[10px] font-black text-blue-600 uppercase tracking-widest hover:text-blue-800 transition-colors">
                  ← Back to Dashboard
                </button>
              </div>
            </div>
          </main>
        )}

        {/* Dashboard Content */}
        {sidebarPage === 'dashboard' && (
        <main className="flex-1 flex divide-x divide-zinc-200 bg-white overflow-hidden">
          {/* LEFT PANEL: Tabs (Incoming / Fulfillment / Drip) */}
          <section className="flex-1 flex flex-col bg-zinc-50/30">
            <div className="p-6">
              <div className="flex bg-zinc-100 p-1.5 rounded-2xl border border-zinc-200 shadow-inner">
                <button
                  onClick={() => setActiveTab('incoming')}
                  className={`flex-1 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === 'incoming' ? 'bg-white shadow-md border border-zinc-200 text-zinc-900' : 'text-zinc-500 hover:text-zinc-700'}`}
                >
                  Incoming
                </button>
                <button
                  onClick={() => setActiveTab('fulfillment')}
                  className={`relative flex-1 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all flex items-center justify-center space-x-2 ${activeTab === 'fulfillment' ? 'bg-white shadow-md border border-zinc-200 text-emerald-700' : 'text-zinc-500 hover:text-zinc-700'}`}
                >
                  <span>Fulfillment</span>
                  {orders.length > 0 && (
                    <span className="bg-emerald-600 text-white w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold shadow-sm">
                      {orders.length}
                    </span>
                  )}
                </button>
                <button
                  onClick={() => setActiveTab('drip')}
                  className={`flex-1 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === 'drip' ? 'bg-white shadow-md border border-zinc-200 text-blue-700' : 'text-zinc-500 hover:text-zinc-700'}`}
                >
                  Drip
                </button>
              </div>
            </div>

            {/* TAB CONTENT */}
            <div className="flex-1 overflow-y-auto px-6 space-y-4 custom-scrollbar pb-6">
              {/* INCOMING TAB */}
              {activeTab === 'incoming' && accessibleLeads.map(lead => (
                <div key={lead.id} className={`bg-white border border-zinc-200 rounded-xl p-5 hover:border-zinc-300 transition-all flex flex-col group ${activeLeadId === lead.id ? 'ring-2 ring-blue-500/20 border-blue-200' : ''}`}>
                  <div className="flex justify-between items-start mb-6">
                    <h3 className="font-bold text-sm text-zinc-900 tracking-tight">{lead.name}</h3>
                    <StatusPill status={lead.status} />
                  </div>
                  <div className="flex items-center text-[9px] font-bold text-zinc-400 uppercase tracking-widest mb-6 space-x-3">
                    <div className="flex items-center"><MapPin size={10} className="mr-1" /> {lead.city}</div>
                    <span>•</span> <span>{lead.distance.toFixed(1)} MI</span>
                    {lead.marginPotential === 'High' && (
                      <><span>•</span> <span className="text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded-md border border-amber-200">HIGH MARGIN</span></>
                    )}
                  </div>
                  <div className="pt-4 border-t border-zinc-100 flex justify-between items-center">
                    <div className="flex-1">
                      <div className="text-[10px] font-bold text-zinc-800 flex items-center">
                        <span className="text-zinc-400 uppercase text-[8px] mr-2">Predicted Volume</span> {lead.favoredProduct}
                      </div>
                    </div>
                    <button 
                      onClick={() => lead.status === 'Ready' ? handleAcceptAndRoute(lead) : handleCall(lead)} 
                      disabled={isCalling} 
                      className={`p-2 rounded-lg transition-all ${isCalling && activeLeadId === lead.id ? 'bg-emerald-100 text-emerald-600 pulsing' : lead.status === 'Ready' ? 'bg-emerald-600 text-white hover:bg-emerald-700' : 'bg-zinc-900 text-white hover:bg-zinc-800'}`}
                    >
                      {lead.status === 'Ready' ? <CheckCircle2 size={12} /> : <Phone size={12} />}
                    </button>
                  </div>
                </div>
              ))}

              {/* FULFILLMENT TAB */}
              {activeTab === 'fulfillment' && (
                <div className="space-y-6">
                  {/* Header with stats and action buttons */}
                  <div className="flex justify-between items-center">
                    <p className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">
                      {stagingOrders.length > 0 ? `${stagingOrders.length} Staged` : ''}{stagingOrders.length > 0 && routes.length > 0 ? ' • ' : ''}{routes.length > 0 ? `${routes.length} Route${routes.length !== 1 ? 's' : ''} • ${fulfillmentOrders.length} Stop${fulfillmentOrders.length !== 1 ? 's' : ''}` : ''}{stagingOrders.length === 0 && routes.length === 0 ? '0 Orders' : ''}
                    </p>
                    <div className="flex items-center space-x-2">
                      {routes.length > 0 && (
                        <button 
                          onClick={handleRefreshRoutes}
                          className="flex items-center space-x-2 px-3 py-2 border border-zinc-200 text-zinc-600 rounded-lg text-[9px] font-black uppercase tracking-widest hover:bg-zinc-100 transition-all"
                        >
                          <RefreshCw size={12} /> <span>Refresh</span>
                        </button>
                      )}
                      {stagingOrders.length > 0 && (
                        <button 
                          onClick={handleGenerateRoutes}
                          className="flex items-center space-x-2 px-4 py-2 bg-emerald-600 text-white rounded-lg text-[9px] font-black uppercase tracking-widest hover:bg-emerald-700 transition-all shadow-sm"
                        >
                          <Navigation size={12} /> <span>Generate Routes</span>
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Staging Area */}
                  {stagingOrders.length > 0 && (
                    <div className="space-y-3">
                      <p className="text-[8px] font-black text-amber-500 uppercase tracking-widest px-2">Staged Orders — Click Generate Routes to assign</p>
                      {stagingOrders.map(order => (
                        <div key={order.id} className="bg-white border border-amber-200 rounded-xl p-4 shadow-sm">
                          <div className="flex justify-between items-start">
                            <div><h4 className="font-bold text-xs text-zinc-900">{order.customerName}</h4><p className="text-[9px] text-zinc-400 font-bold uppercase">{order.city} • {order.items} • {order.weight_lbs} lbs</p></div>
                            <div className="bg-amber-50 text-amber-700 px-2 py-0.5 rounded-full text-[7px] font-black flex items-center"><div className="w-1 h-1 bg-amber-500 rounded-full mr-1.5" /> STAGED</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Active Routes */}
                  {routes.map(route => (
                    <div key={route.name} className="bg-white border border-zinc-200 rounded-xl overflow-hidden shadow-sm">
                      <div className="bg-zinc-900 px-5 py-3 flex justify-between items-center text-white">
                        <span className="text-[9px] font-black uppercase italic tracking-widest">{route.name}</span>
                        <div className="flex items-center space-x-4">
                          <span className={`text-[8px] font-black font-mono ${route.totalWeight > MAX_TRUCK_WEIGHT ? 'text-red-400' : 'opacity-50'}`}>
                            {route.totalWeight}/{MAX_TRUCK_WEIGHT} LB
                          </span>
                        </div>
                      </div>
                      <div className="p-4 space-y-2">
                        {route.items.map(order => (
                          <div key={order.id} className="flex justify-between items-center p-3 rounded-lg bg-zinc-50 border border-zinc-100">
                            <div className="flex items-center space-x-3">
                              <span className="w-6 h-6 rounded-lg bg-zinc-900 text-white flex items-center justify-center text-[10px] font-black">{order.stopNumber}</span>
                              <div>
                                <span className="font-bold text-xs text-zinc-900">{order.customerName}</span>
                                <p className="text-[8px] text-zinc-400 font-bold uppercase">{order.items} • {order.weight_lbs} lbs</p>
                              </div>
                            </div>
                            <span className="text-[7px] font-black text-emerald-600 uppercase tracking-widest">Stop {order.stopNumber}</span>
                          </div>
                        ))}
                      </div>
                      {route.totalWeight > MAX_TRUCK_WEIGHT && (
                        <div className="px-5 py-3 bg-red-50 border-t border-red-100 flex items-center space-x-2">
                          <AlertCircle size={12} className="text-red-500" />
                          <span className="text-[9px] font-bold text-red-600">Over truck capacity — consider splitting this route</span>
                        </div>
                      )}
                    </div>
                  ))}

                  {routes.length === 0 && stagingOrders.length === 0 && (
                    <div className="h-64 flex flex-col items-center justify-center opacity-20 space-y-4">
                      <Truck size={32} /> <p className="text-[9px] font-black uppercase tracking-widest">No orders in fulfillment yet</p>
                    </div>
                  )}
                </div>
              )}

              {/* DRIP TAB */}
              {activeTab === 'drip' && accessibleLeads.map(lead => (
                <div key={lead.id} className="bg-white border border-zinc-200 rounded-xl p-5 hover:border-zinc-300 transition-all flex flex-col">
                  <div className="flex justify-between items-start mb-6">
                    <h3 className="font-bold text-sm text-zinc-900 tracking-tight">{lead.name}</h3>
                    <StatusPill status={lead.status} />
                  </div>
                  <div className="flex items-center text-[9px] font-bold text-zinc-400 uppercase tracking-widest mb-6 space-x-3">
                    <div className="flex items-center"><MapPin size={10} className="mr-1" /> {lead.city}</div>
                    <span>•</span> <span>{lead.distance.toFixed(1)} MI</span>
                  </div>
                  <div className="pt-4 border-t border-zinc-100 flex flex-col space-y-1">
                    <div className="text-[10px] font-bold text-zinc-800 flex items-center">
                      <span className="text-zinc-400 uppercase text-[8px] mr-2">Predicted Volume</span> {lead.favoredProduct}
                    </div>
                    {lead.nextContactDate && (
                      <div className="text-[9px] text-blue-600 font-bold flex items-center">
                        <Calendar size={10} className="mr-1" /> Next contact: {lead.nextContactDate}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* RIGHT PANEL: Vapi Logic HUD */}
          <section className="flex-1 flex flex-col relative">
            {callPhase === 'connecting' && (
              <div className="absolute inset-0 bg-white/95 z-20 flex flex-col items-center justify-center p-12 text-center animate-in fade-in duration-300">
                <div className="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-2xl flex items-center justify-center mb-6 pulsing">
                  <Phone size={32} />
                </div>
                <h3 className="text-sm font-black text-zinc-900 uppercase tracking-widest mb-2">Dialing {dialingName}...</h3>
                <p className="text-[9px] text-zinc-400 font-bold uppercase tracking-widest leading-loose">Establishing Real-Time Audio Stream</p>
              </div>
            )}

            <div className="p-6 h-full flex flex-col">
              <div className="flex items-center space-x-2 mb-8 text-blue-500 font-semibold italic text-sm">
                <CheckCircle2 size={14} /> <span>Vapi Logic HUD</span>
              </div>
              <div className="flex-1 overflow-y-auto space-y-4 custom-scrollbar">
                {/* Transcript Stream */}
                {(callPhase === 'streaming' || callPhase === 'live_transfer' || showTranscriptAudit) && (
                  <div className="space-y-4 animate-in slide-in-from-bottom duration-300">
                    {transcription.map((line, i) => (
                      <div key={i} className={`flex flex-col ${line.role === 'ai' ? 'items-start' : 'items-end'}`}>
                        <span className="text-[7px] font-black text-zinc-400 uppercase tracking-widest mb-1">{line.role === 'ai' ? 'Agent (Ali\'s Wholesale)' : 'Customer Response'}</span>
                        <div className={`p-3 rounded-xl max-w-[85%] text-xs font-medium leading-relaxed ${line.role === 'ai' ? 'bg-blue-50 text-blue-900 border border-blue-100' : 'bg-zinc-50 text-zinc-900 border border-zinc-200'}`}>
                          <HighlightedText text={line.text} />
                        </div>
                      </div>
                    ))}
                    {callPhase === 'streaming' && (
                      <div className="flex space-x-1 items-center p-2 opacity-50">
                        <div className="w-1 h-1 bg-zinc-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                        <div className="w-1 h-1 bg-zinc-400 rounded-full animate-bounce" style={{ animationDelay: '200ms' }} />
                        <div className="w-1 h-1 bg-zinc-400 rounded-full animate-bounce" style={{ animationDelay: '400ms' }} />
                      </div>
                    )}
                  </div>
                )}

                {/* Calculating Phase */}
                {callPhase === 'calculating' && (
                  <div className="flex-1 flex flex-col items-center justify-center space-y-4 animate-in fade-in">
                    <Loader2 className="animate-spin text-zinc-300" size={32} />
                    <div className="text-center">
                      <p className="text-xs font-black text-zinc-900 uppercase tracking-widest mb-1">Processing Intent</p>
                      <p className="text-[8px] text-zinc-400 font-bold uppercase tracking-widest">Checking 2,500lb Truck Capacity & Credit Verification...</p>
                    </div>
                  </div>
                )}

                {/* LIVE TRANSFER — replaces the old "Alert Ali" banner */}
                {callPhase === 'live_transfer' && (
                  <div className="flex flex-col space-y-4 animate-in slide-in-from-bottom duration-500">
                    <div className="bg-rose-50 border-2 border-rose-300 rounded-xl p-6 text-center">
                      <div className="w-16 h-16 bg-rose-100 text-rose-600 rounded-2xl flex items-center justify-center mx-auto mb-4 pulsing">
                        <PhoneForwarded size={32} />
                      </div>
                      <h3 className="text-sm font-black text-rose-700 uppercase tracking-widest mb-2">Live Transfer Requested</h3>
                      <p className="text-xs text-zinc-600 leading-relaxed mb-2">
                        The AI agent told the customer: <strong>&quot;Hold on, I&apos;m transferring you to my manager.&quot;</strong>
                      </p>
                      <p className="text-[9px] text-zinc-400 font-bold uppercase tracking-widest mb-6">
                        The customer is waiting on the line for Ali
                      </p>
                      <button 
                        onClick={handleTakeOverCall}
                        className="w-full py-4 bg-rose-600 text-white rounded-xl font-bold text-[11px] tracking-widest uppercase hover:bg-rose-700 shadow-xl transition-all flex items-center justify-center space-x-3"
                      >
                        <Phone size={14} className="animate-pulse" /> <span>Take Over Call</span>
                      </button>
                      <p className="text-[8px] text-zinc-400 mt-3 uppercase tracking-widest">
                        {dialingName} • {isNegativeSentiment ? 'Negative Sentiment Detected' : 'Escalation Triggered'}
                      </p>
                    </div>
                  </div>
                )}

                {/* CREDIT BLOCK — inline action card (no separate tab) */}
                {callPhase === 'credit_block' && lastCallOutcome?.creditBlocked && (
                  <div className="flex flex-col h-full animate-in slide-in-from-bottom duration-500">
                    <div className="bg-white border-2 border-orange-300 rounded-xl shadow-sm overflow-hidden flex flex-col transition-all">
                      <div className="p-6 border-b border-orange-200 bg-orange-50 flex justify-between items-center">
                        <span className="text-sm font-bold text-zinc-900">{lastCallOutcome.lead.name}</span>
                        <div className="bg-orange-100 text-orange-700 px-3 py-1 rounded-full border border-orange-200 flex items-center text-[8px] font-black tracking-widest">
                          <Ban size={8} className="mr-1.5" /> CREDIT BLOCKED
                        </div>
                      </div>
                      <div className="p-6 bg-orange-50/50 border-b border-orange-100">
                        <div className="flex items-center space-x-2 mb-3">
                          <ShieldAlert size={16} className="text-orange-600" />
                          <span className="text-[10px] font-black text-orange-700 uppercase tracking-widest">Credit Limit Exceeded</span>
                        </div>
                        <p className="text-xs text-zinc-700 leading-relaxed">
                          This order cannot be processed. The customer&apos;s outstanding balance plus this order exceeds their credit limit.
                        </p>
                      </div>
                      <div className="grid grid-cols-2 divide-x divide-y divide-orange-100">
                        <div className="p-6">
                          <p className="text-[9px] font-black text-zinc-400 uppercase tracking-widest mb-2">Credit Limit</p>
                          <p className="text-xs font-black text-zinc-900 font-mono">${lastCallOutcome.creditDetails!.limit.toLocaleString()}</p>
                        </div>
                        <div className="p-6">
                          <p className="text-[9px] font-black text-zinc-400 uppercase tracking-widest mb-2">Outstanding</p>
                          <p className="text-xs font-black text-rose-600 font-mono">${lastCallOutcome.creditDetails!.outstanding.toLocaleString()}</p>
                        </div>
                        <div className="p-6">
                          <p className="text-[9px] font-black text-zinc-400 uppercase tracking-widest mb-2">Order Amount</p>
                          <p className="text-xs font-black text-zinc-900 font-mono">${lastCallOutcome.creditDetails!.orderAmount.toLocaleString()}</p>
                        </div>
                        <div className="p-6">
                          <p className="text-[9px] font-black text-zinc-400 uppercase tracking-widest mb-2">New Total</p>
                          <p className="text-xs font-black text-rose-600 font-mono">${(lastCallOutcome.creditDetails!.outstanding + lastCallOutcome.creditDetails!.orderAmount).toLocaleString()}</p>
                        </div>
                      </div>
                      <div className="p-6 bg-orange-50/50 space-y-3">
                        <button onClick={() => {
                          // Override: approve the order despite credit limit
                          handleAcceptAndRoute(lastCallOutcome!.lead);
                          setToast('Credit override approved — order routed to fulfillment');
                        }} className="w-full py-3 bg-emerald-600 text-white rounded-lg font-bold text-[10px] tracking-widest uppercase hover:bg-emerald-700 transition-all flex items-center justify-center space-x-2">
                          <CheckCircle2 size={12} /> <span>Override & Approve Order</span>
                        </button>
                        <button onClick={() => {
                          setLeads(prev => prev.map(l => l.id === lastCallOutcome!.lead.id ? { ...l, status: 'Escalated' } : l));
                          setCallPhase('idle');
                          setLastCallOutcome(null);
                          setToast('Order declined — lead marked for follow-up');
                        }} className="w-full py-3 bg-zinc-900 text-white rounded-lg font-bold text-[10px] tracking-widest uppercase hover:bg-zinc-800 transition-all flex items-center justify-center space-x-2">
                          <X size={12} /> <span>Decline Order</span>
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {/* SUMMARY — successful call or drip enrollment */}
                {callPhase === 'summary' && !showTranscriptAudit && lastCallOutcome && (
                  <div className="flex flex-col h-full animate-in slide-in-from-bottom duration-500">
                    <div className="bg-white border border-zinc-200 rounded-xl shadow-sm overflow-hidden flex flex-col transition-all">
                      <div className="p-6 border-b border-zinc-100 bg-zinc-50/50 flex justify-between items-center">
                        <span className="text-sm font-bold text-zinc-900">{lastCallOutcome.lead.name}</span>
                        <StatusPill status={lastCallOutcome.status as any} labelOverride={lastCallOutcome.status === 'Ready' ? 'SUCCESS' : lastCallOutcome.status === 'Drip' ? 'DRIP ENROLLED' : 'ESCALATION'} />
                      </div>
                      {lastCallOutcome.status === 'Drip' ? (
                        <div className="p-6">
                          <div className="bg-blue-50 border border-blue-100 rounded-xl p-5">
                            <div className="flex items-center space-x-2 mb-3">
                              <Calendar size={14} className="text-blue-600" />
                              <span className="text-[10px] font-black text-blue-700 uppercase tracking-widest">Drip Campaign Enrolled</span>
                            </div>
                            <p className="text-xs text-zinc-700 leading-relaxed mb-3">
                              Customer is not ready to order now. Automatically enrolled in a 30-day follow-up drip campaign.
                            </p>
                            <div className="grid grid-cols-2 gap-4 mt-4">
                              <div>
                                <p className="text-[9px] font-black text-zinc-400 uppercase tracking-widest mb-1">Next Outreach</p>
                                <p className="text-xs font-bold text-blue-700">In 30 days</p>
                              </div>
                              <div>
                                <p className="text-[9px] font-black text-zinc-400 uppercase tracking-widest mb-1">Channel</p>
                                <p className="text-xs font-bold text-blue-700">Phone + Email</p>
                              </div>
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div className="grid grid-cols-2 divide-x divide-y divide-zinc-100">
                          <div className="p-6"><p className="text-[9px] font-black text-zinc-400 uppercase tracking-widest mb-2">Order</p><p className="text-xs font-bold text-zinc-900">{lastCallOutcome.extraction}</p></div>
                          <div className="p-6"><p className="text-[9px] font-black text-zinc-400 uppercase tracking-widest mb-2">Total Payload</p><p className="text-xs font-black text-zinc-900 font-mono">~{parseInt(lastCallOutcome.lead.favoredProduct.match(/(\d+)/)?.[0] || '50') + parseInt(lastCallOutcome.lead.secondaryProduct.match(/(\d+)/)?.[0] || '25')} LBS</p></div>
                          <div className="p-6">
                            <p className="text-[9px] font-black text-zinc-400 uppercase tracking-widest mb-2">Credit Status</p>
                            {(() => {
                              const credit = lastCallOutcome.lead.creditAccount;
                              if (!credit) return <div className="flex items-center text-xs font-bold text-zinc-900"><CheckCircle2 size={12} className="text-emerald-500 mr-2" /> No Account</div>;
                              const orderAmt = estimateOrderAmount(lastCallOutcome.lead);
                              const remaining = credit.creditLimit - credit.outstandingBalance - orderAmt;
                              return (
                                <div>
                                  <div className="flex items-center text-xs font-bold text-emerald-700"><CheckCircle2 size={12} className="text-emerald-500 mr-2" /> Verified</div>
                                  <p className="text-[8px] text-zinc-400 mt-1">${remaining.toLocaleString()} remaining</p>
                                </div>
                              );
                            })()}
                          </div>
                          <div className="p-6"><p className="text-[9px] font-black text-zinc-400 uppercase tracking-widest mb-2">Est. Margin</p><p className="text-xs font-bold text-zinc-900 font-mono">22.0%</p></div>
                        </div>
                      )}
                      <div className="p-6 bg-zinc-50/50 space-y-4">
                        {lastCallOutcome.status === 'Ready' && (
                          <button onClick={() => handleAcceptAndRoute(lastCallOutcome!.lead)} className="w-full py-3 bg-emerald-600 text-white rounded-lg font-bold text-[10px] tracking-widest uppercase hover:bg-emerald-700 transition-all flex items-center justify-center space-x-2">
                            <Truck size={12} /> <span>Accept Order</span>
                          </button>
                        )}
                        {lastCallOutcome.status === 'Drip' && (
                          <button onClick={() => {
                            setLastCallOutcome(null);
                            setCallPhase('idle');
                          }} className="w-full py-3 bg-blue-600 text-white rounded-lg font-bold text-[10px] tracking-widest uppercase hover:bg-blue-700 transition-all">Acknowledge</button>
                        )}
                        <button onClick={() => setShowTranscriptAudit(true)} className="w-full text-[9px] font-black text-zinc-400 uppercase tracking-widest hover:text-zinc-600 transition-all">View Full Transcript</button>
                      </div>
                    </div>
                  </div>
                )}

                {showTranscriptAudit && (
                  <button onClick={() => setShowTranscriptAudit(false)} className="mt-4 w-full py-2 border border-zinc-200 rounded-lg text-[9px] font-black text-zinc-600 uppercase tracking-widest bg-white hover:bg-zinc-50">Close Transcript</button>
                )}

                {/* Idle State */}
                {callPhase === 'idle' && (
                  <div className="h-full flex flex-col items-center justify-center opacity-10 grayscale space-y-4">
                    <Phone size={32} /> <p className="text-[9px] font-black uppercase tracking-widest">System Standby</p>
                  </div>
                )}
              </div>
            </div>
          </section>


        </main>
        )}

        {/* Toast */}
        {toast && (
          <div className="fixed top-8 right-8 bg-zinc-900 text-white rounded-xl p-4 shadow-2xl animate-in slide-in-from-right flex items-center space-x-4 border border-zinc-800 z-[100]">
            <CheckCircle2 size={16} className="text-blue-500" />
            <p className="text-[10px] font-bold uppercase tracking-widest">{toast}</p>
            <button onClick={() => setToast(null)}><X size={12} className="text-zinc-500" /></button>
          </div>
        )}
      </div>
    </div>
  );
}
