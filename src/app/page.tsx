'use client';

import { useState, useMemo, useEffect, useRef } from 'react';
import { mockLeads, mockOrders, Lead, Order } from '../data/mockData';
import {
  MapPin, Package, Truck, TrendingUp, AlertCircle, Phone,
  CheckCircle2, History, X, Navigation, Inbox, Calendar, LayoutDashboard, Users, Map as MapIcon, Settings, Loader2
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

const keywords = ['Sesame', 'Raisins', 'Chilies', 'Cinnamon', 'Poppy', 'Nuts', 'Dried Fruits', 'Walnuts'];
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
  const [callPhase, setCallPhase] = useState<'idle' | 'connecting' | 'streaming' | 'calculating' | 'summary'>('idle');
  const [transcription, setTranscription] = useState<{ role: 'ai' | 'customer'; text: string }[]>([]);
  const [activeLeadId, setActiveLeadId] = useState<string | null>(null);
  const [showEscalation, setShowEscalation] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [highMarginOnly, setHighMarginOnly] = useState(false);
  const [lastCallOutcome, setLastCallOutcome] = useState<{ lead: Lead; status: string; extraction: string } | null>(null);
  const [showTranscriptAudit, setShowTranscriptAudit] = useState(false);
  const [dialingName, setDialingName] = useState('');
  const [isNegativeSentiment, setIsNegativeSentiment] = useState(false);
  const isNegativeSentimentRef = useRef(false);
  const [showSentimentBanner, setShowSentimentBanner] = useState(false);
  const [isTakenOver, setIsTakenOver] = useState(false);
  const isTakenOverRef = useRef(false);
  const [activeTab, setActiveTab] = useState<'incoming' | 'action' | 'drip'>('incoming');
  const [lastActionTimestamp, setLastActionTimestamp] = useState(0); // For pulsing tab on new escalation

  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  const actionCount = useMemo(() => leads.filter(l => l.status === 'Escalated' || l.hasNegativeSentiment).length, [leads]);

  const accessibleLeads = useMemo(() => {
    return leads
      .map(lead => ({ ...lead, distance: calculateDistance(HQ.lat, HQ.lng, lead.lat, lead.lng) }))
      .filter(lead => {
        if (activeTab === 'action') return lead.status === 'Escalated' || lead.hasNegativeSentiment;
        if (activeTab === 'incoming') return lead.status === 'Incoming Queue' || lead.status === 'Ready';
        if (activeTab === 'drip') return lead.status === 'Drip';
        return false;
      })
      .filter(lead => !highMarginOnly || lead.marginPotential === 'High')
      .sort((a, b) => a.distance - b.distance);
  }, [leads, highMarginOnly, activeTab]);

  const logisticsOrders = useMemo(() => {
    const pendingFromLeads: Order[] = leads
      .filter(l => l.status === 'Ready')
      .map(l => ({
        id: `LOD-${l.id}`,
        customerName: l.name,
        items: `${l.favoredProduct} + ${l.secondaryProduct}`,
        weight_lbs: parseInt(l.favoredProduct.match(/(\d+)/)?.[0] || '50') + 25,
        city: l.city, lat: l.lat, lng: l.lng, route: '', status: 'Ready'
      }));
    return [...pendingFromLeads, ...orders];
  }, [leads, orders]);

  const routes = useMemo(() => {
    const groups: Record<string, Order[]> = {};
    logisticsOrders.forEach(order => {
      const r = order.route || 'Unassigned';
      if (!groups[r]) groups[r] = [];
      groups[r].push(order);
    });
    return Object.entries(groups).map(([name, items]) => ({
      name, items: items.sort((a, b) => (a.stopNumber || 0) - (b.stopNumber || 0)),
      totalWeight: items.reduce((sum, o) => sum + o.weight_lbs, 0)
    }));
  }, [logisticsOrders]);

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
    setShowSentimentBanner(false);
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
        { role: 'ai', text: 'Hi, this is Ali’s Wholesale. We have a special on bulk Walnuts this week.' },
        { role: 'customer', text: 'Your walnut price is too high; I’m getting it for $2.50 elsewhere.' },
        { role: 'ai', text: 'I understand the price concern. I’ll escalate this to my manager, Ali, right away. Thank you.' }
      ];
      finalStatus = 'Escalated';
    } else if (lead.name === 'The Rolling Pin') {
      script = [
        { role: 'ai', text: 'Hi, this is Ali’s Wholesale. We noticed your order for The Rolling Pin is overdue. Would you like to restock?' },
        { role: 'customer', text: 'Finally! I\'ve been waiting for a call. Your last delivery was late and I’m very angry. If this happens again, I’m going to cancel my account!' },
        { role: 'ai', text: 'I am so sorry for the delay. Let me look into that for you right now...' }
      ];
      finalStatus = 'Escalated';
    } else {
      const rand = Math.random();
      if (rand < 0.5) {
        script = [
          { role: 'ai', text: 'Hi, this is Ali’s Wholesale. We’re in your area tomorrow. Do you need a restock?' },
          { role: 'customer', text: 'Yes! We actually ran out of Sesame seeds. Can you bring 50lb? And let’s add 25lb of Raisins and some Chilies for our spicy loaf.' },
          { role: 'ai', text: 'Great, we’ll have those Sesame seeds, Raisins, and Chilies with you tomorrow. Thank you!' }
        ];
      } else {
        script = [
          { role: 'ai', text: 'Hi, this is Ali’s Wholesale. Checking in for your weekly Cinnamon and Poppy seed order.' },
          { role: 'customer', text: 'Perfect timing. We need 100lb of Cinnamon and let\'s try 50lb of those new Nuts you mentioned.' },
          { role: 'ai', text: 'Got it. 100lb Cinnamon and 50lb Nuts recorded. We’ll see you tomorrow. Thank you!' }
        ];
      }
    }

    for (const line of script) {
      setTranscription(prev => [...prev, line]);
      
      // Sentiment Detection
      if (['angry', 'upset', 'cancel'].some(k => line.text.toLowerCase().includes(k))) {
        setIsNegativeSentiment(true);
        isNegativeSentimentRef.current = true;
        setShowSentimentBanner(true);
        setLastActionTimestamp(Date.now());
      }

      // Delay with Takeover Check
      const startTime = Date.now();
      while (Date.now() - startTime < 3500) {
        if (isTakenOverRef.current) {
          setIsCalling(false);
          setActiveLeadId(null);
          return; // Kill the process
        }
        await new Promise(r => setTimeout(r, 100));
      }
    }

    // Guard: If negative sentiment is detected, do NOT automatically proceed to summary.
    // This allows the user to manually "Alert Ali" or "Ping Ali".
    if (isNegativeSentimentRef.current && !isTakenOverRef.current) {
      return;
    }

    // Phase 3: Calculating
    setCallPhase('calculating');
    await new Promise(r => setTimeout(r, 1500));

    // Phase 4: Summary Transition
    if (!isTakenOverRef.current) {
      setCallPhase('summary');
      const isFollowUp = (finalStatus as string) === 'Follow-up';
      setLeads(prev => prev.map(l => l.id === lead.id ? { ...l, status: finalStatus, nextContactDate: isFollowUp ? 'In 30 days' : undefined } : l));
      setLastCallOutcome({ lead, status: finalStatus, extraction: lead.name === 'Hempstead Hearth' ? 'Walnuts (Price Conflict)' : `${lead.favoredProduct} + ${lead.secondaryProduct}` });

      if (finalStatus === 'Ready') setToast('Order Dispatched to Logistics Feed');
      setIsCalling(false);
      setActiveLeadId(null);
    }
  };

  const handleHandoffToFulfillment = (lead: Lead) => {
    const newOrder: Order = {
      id: `ORD-${Math.random().toString(36).substr(2, 6).toUpperCase()}`,
      customerName: lead.name,
      items: lead.favoredProduct,
      weight_lbs: parseInt(lead.favoredProduct.match(/(\d+)/)?.[0] || '50'),
      city: lead.city,
      lat: lead.lat,
      lng: lead.lng,
      route: lead.city === 'Mineola' ? 'Mineola Loop' : 'Garden City Loop',
      status: 'Ready'
    };
    setOrders(prev => [...prev, newOrder]);
    setLeads(prev => prev.map(l => l.id === lead.id ? { ...l, status: 'Not Interested' } : l));
    setToast(`${lead.name} moved to Fulfillment`);
  };

  const handleRouteLead = (orderId: string, city: string) => {
    const routeName = city === 'Mineola' ? 'Mineola Loop' : 'Garden City Loop';
    if (orderId.startsWith('LOD-')) {
      const leadId = orderId.replace('LOD-', '');
      const lead = leads.find(l => l.id === leadId);
      if (lead) {
        setOrders(prev => [...prev, {
          id: `ORD-${Math.random().toString(36).substr(2, 4).toUpperCase()}`,
          customerName: lead.name, items: `${lead.favoredProduct} + ${lead.secondaryProduct}`,
          weight_lbs: parseInt(lead.favoredProduct.match(/(\d+)/)?.[0] || '50') + 25,
          city: lead.city, lat: lead.lat, lng: lead.lng, route: routeName, status: 'Routed',
          stopNumber: orders.filter(o => o.route === routeName).length + 1
        }]);
        setLeads(prev => prev.map(l => l.id === leadId ? { ...l, status: 'Not Interested' } : l));
        setToast(`Routed ${lead.name} to ${routeName}`);
      }
    }
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
    const c = map[status];
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

      <aside className="w-64 bg-zinc-900 border-r border-zinc-800 flex flex-col shrink-0 text-zinc-400">
        <div className="p-8 pb-12">
          <div className="flex items-center space-x-3 mb-10">
            <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center font-black text-white italic">A</div>
            <span className="text-white font-bold tracking-tight text-xl">ALI WHOLESALE</span>
          </div>
          <nav className="space-y-1">
            {[{ l: 'Dashboard', i: LayoutDashboard, a: true }, { l: 'Leads', i: Users }, { l: 'Routes', i: MapIcon }, { l: 'Analytics', i: TrendingUp }].map(item => (
              <button key={item.l} className={`flex items-center space-x-3 px-4 py-3 w-full rounded-xl transition-all ${item.a ? 'bg-zinc-800 text-white' : 'hover:bg-zinc-800/50'}`}>
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
        {showEscalation && (
          <div className="absolute top-0 inset-x-0 bg-red-600 text-white p-4 z-50 flex justify-between items-center shadow-xl animate-in slide-in-from-top duration-300">
            <span className="font-black text-[10px] tracking-widest uppercase italic">[ ⚠️ ESCALATE TO ALI ]: Hempstead Hearth - Pricing Conflict Detected</span>
            <button onClick={() => setShowEscalation(false)} className="bg-zinc-900 px-4 py-2 rounded-lg text-[10px] font-black uppercase">Acknowledge</button>
          </div>
        )}

        {showSentimentBanner && (
          <div className="absolute top-0 inset-x-0 bg-rose-600 text-white p-4 z-50 flex justify-between items-center shadow-xl animate-in slide-in-from-top duration-300">
            <span className="font-black text-[10px] tracking-widest uppercase italic">[ ⚠️ NEGATIVE SENTIMENT ]: {dialingName}</span>
            <button onClick={() => setShowSentimentBanner(false)} className="bg-zinc-900 px-4 py-2 rounded-lg text-[10px] font-black uppercase">Acknowledge</button>
          </div>
        )}

        <header className="h-16 border-b border-zinc-200 flex items-center justify-between px-10">
          <div>
            <h1 className="text-sm font-black text-zinc-900 uppercase italic">Western Long Island</h1>
            <p className="text-[9px] text-zinc-400 font-bold uppercase tracking-widest">Mineola Hub Cluster</p>
          </div>
          <button onClick={() => setHighMarginOnly(!highMarginOnly)} className={`flex items-center space-x-2 px-3 py-1.5 rounded-lg border text-[9px] font-black uppercase tracking-widest ${highMarginOnly ? 'bg-amber-50 border-amber-200 text-amber-600' : 'border-zinc-200 text-zinc-400'}`}>
            <TrendingUp size={12} /> <span>High Margins Only</span>
          </button>
        </header>

        <main className="flex-1 flex divide-x divide-zinc-200 bg-white overflow-hidden">
          <section className="flex-1 flex flex-col bg-zinc-50/30">
            <div className="p-6">
              <div className="flex bg-zinc-100 p-1.5 rounded-2xl border border-zinc-200 shadow-inner">
                <button
                  onClick={() => setActiveTab('action')}
                  className={`relative flex-1 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all flex items-center justify-center space-x-2 ${activeTab === 'action' ? 'bg-white shadow-md border border-zinc-200 text-rose-600' : 'text-zinc-500 hover:text-zinc-700'}`}
                >
                  <span className={(Date.now() - lastActionTimestamp < 30000 && activeTab !== 'action') ? 'animate-pulse text-red-600 font-extrabold' : ''}>Action Required</span>
                  {actionCount > 0 && (
                    <span className="bg-rose-600 text-white w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold shadow-sm">
                      {actionCount}
                    </span>
                  )}
                </button>
                <button
                  onClick={() => setActiveTab('incoming')}
                  className={`flex-1 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === 'incoming' ? 'bg-white shadow-md border border-zinc-200 text-zinc-900' : 'text-zinc-500 hover:text-zinc-700'}`}
                >
                  Incoming
                </button>
                <button
                  onClick={() => setActiveTab('drip')}
                  className={`flex-1 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === 'drip' ? 'bg-white shadow-md border border-zinc-200 text-zinc-900' : 'text-zinc-500 hover:text-zinc-700'}`}
                >
                  Drip
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto px-6 space-y-4 custom-scrollbar">
              {accessibleLeads.map(lead => (
                <div key={lead.id} className={`bg-white border border-zinc-200 rounded-xl p-5 hover:border-zinc-300 transition-all flex flex-col group ${activeLeadId === lead.id ? 'ring-2 ring-blue-500/20 border-blue-200' : ''}`}>
                  <div className="flex justify-between items-start mb-6">
                    <h3 className="font-bold text-sm text-zinc-900 tracking-tight">{lead.name}</h3>
                    <StatusPill status={lead.status} labelOverride={activeTab === 'action' ? 'ESCALATE' : undefined} />
                  </div>
                  <div className="flex items-center text-[9px] font-bold text-zinc-400 uppercase tracking-widest mb-6 space-x-3">
                    <div className="flex items-center"><MapPin size={10} className="mr-1" /> {lead.city}</div>
                    <span>•</span> <span>{lead.distance.toFixed(1)} MI</span>
                  </div>
                  <div className="pt-4 border-t border-zinc-100 flex justify-between items-center">
                    <div className="flex-1">
                      {activeTab === 'action' ? (
                        <div className="bg-rose-50 border border-rose-100 p-2 rounded-lg">
                          <p className="text-[10px] font-bold text-rose-700 flex items-center italic">
                            <AlertCircle size={10} className="mr-1.5" /> 
                            {lead.name === 'Hempstead Hearth' ? 'Price Conflict Detected - Intervention Required' : lead.hasNegativeSentiment ? 'Negative Sentiment - Urgent Handoff' : 'Escalated for Manual Review'}
                          </p>
                        </div>
                      ) : (
                        <div className="text-[10px] font-bold text-zinc-800 flex items-center">
                          <span className="text-zinc-400 uppercase text-[8px] mr-2">Predicted Volume</span> {lead.favoredProduct}
                        </div>
                      )}
                    </div>
                    {activeTab === 'incoming' && (
                      <button 
                        onClick={() => lead.status === 'Ready' ? handleHandoffToFulfillment(lead) : handleCall(lead)} 
                        disabled={isCalling} 
                        className={`p-2 rounded-lg transition-all ${isCalling && activeLeadId === lead.id ? 'bg-emerald-100 text-emerald-600 pulsing' : lead.status === 'Ready' ? 'bg-emerald-600 text-white hover:bg-emerald-700' : 'bg-zinc-900 text-white hover:bg-zinc-800'}`}
                      >
                        {lead.status === 'Ready' ? <CheckCircle2 size={12} /> : <Phone size={12} />}
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="w-[480px] flex flex-col relative">
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
                {(callPhase === 'streaming' || showTranscriptAudit) && (
                  <div className="space-y-4 animate-in slide-in-from-bottom duration-300">
                    {transcription.map((line, i) => (
                      <div key={i} className={`flex flex-col ${line.role === 'ai' ? 'items-start' : 'items-end'}`}>
                        <span className="text-[7px] font-black text-zinc-400 uppercase tracking-widest mb-1">{line.role === 'ai' ? 'Agent (Ali’s Wholesale)' : 'Customer Response'}</span>
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

                {callPhase === 'calculating' && (
                  <div className="flex-1 flex flex-col items-center justify-center space-y-4 animate-in fade-in">
                    <Loader2 className="animate-spin text-zinc-300" size={32} />
                    <div className="text-center">
                      <p className="text-xs font-black text-zinc-900 uppercase tracking-widest mb-1">Processing Intent</p>
                      <p className="text-[8px] text-zinc-400 font-bold uppercase tracking-widest">Checking 2,500lb Truck Capacity & Credit Verification...</p>
                    </div>
                  </div>
                )}

                {callPhase === 'summary' && !showTranscriptAudit && lastCallOutcome && (
                  <div className="flex flex-col h-full animate-in slide-in-from-bottom duration-500">
                    <div className="bg-white border border-zinc-200 rounded-xl shadow-sm overflow-hidden flex flex-col transition-all">
                      <div className="p-6 border-b border-zinc-100 bg-zinc-50/50 flex justify-between items-center">
                        <span className="text-sm font-bold text-zinc-900">{lastCallOutcome.lead.name}</span>
                        <StatusPill status={lastCallOutcome.status as any} labelOverride={lastCallOutcome.status === 'Ready' ? 'SUCCESS' : lastCallOutcome.status === 'Escalated' ? 'ESCALATE TO ALI' : 'ESCALATION'} />
                      </div>
                      <div className="grid grid-cols-2 divide-x divide-y divide-zinc-100">
                        <div className="p-6"><p className="text-[9px] font-black text-zinc-400 uppercase tracking-widest mb-2">Order</p><p className="text-xs font-bold text-zinc-900">{lastCallOutcome.extraction}</p></div>
                        <div className="p-6"><p className="text-[9px] font-black text-zinc-400 uppercase tracking-widest mb-2">Total Payload</p><p className="text-xs font-black text-zinc-900 font-mono">~{parseInt(lastCallOutcome.lead.favoredProduct.match(/(\d+)/)?.[0] || '50') + 25} LBS</p></div>
                        <div className="p-6"><p className="text-[9px] font-black text-zinc-400 uppercase tracking-widest mb-2">Credit Status</p><div className="flex items-center text-xs font-bold text-zinc-900"><CheckCircle2 size={12} className="text-emerald-500 mr-2" /> Verified</div></div>
                        <div className="p-6"><p className="text-[9px] font-black text-zinc-400 uppercase tracking-widest mb-2">Est. Margin</p><p className="text-xs font-bold text-zinc-900 font-mono">22.0%</p></div>
                      </div>
                      <div className="p-6 bg-zinc-50/50 space-y-4">
                        {lastCallOutcome.status !== 'Escalated' && (
                          <button onClick={() => { 
                            if (lastCallOutcome.status === 'Ready') handleHandoffToFulfillment(lastCallOutcome.lead);
                            setLastCallOutcome(null); 
                            setCallPhase('idle'); 
                          }} className="w-full py-3 bg-zinc-900 text-white rounded-lg font-bold text-[10px] tracking-widest uppercase hover:bg-zinc-800 transition-all">Acknowledge & Handoff</button>
                        )}
                        <button onClick={() => setShowTranscriptAudit(true)} className="w-full text-[9px] font-black text-zinc-400 uppercase tracking-widest hover:text-zinc-600 transition-all">View Full Transcript</button>
                      </div>
                    </div>
                  </div>
                )}

                {showTranscriptAudit && (
                  <button onClick={() => setShowTranscriptAudit(false)} className="mt-4 w-full py-2 border border-zinc-200 rounded-lg text-[9px] font-black text-zinc-600 uppercase tracking-widest bg-white">Ping Ali</button>
                )}

                {isNegativeSentiment && !isTakenOver && (
                  <div className="mt-auto pt-6 border-t border-rose-100 flex flex-col space-y-4 animate-in slide-in-from-bottom duration-500">
                    <button 
                      onClick={() => {
                        isTakenOverRef.current = true;
                        setIsTakenOver(true);
                        setIsCalling(false);
                        setActiveLeadId(null);
                        setLeads(prev => prev.map(l => l.id === activeLeadId ? { ...l, status: 'Escalated' } : l));
                        setToast('Call Redirected to Ali’s Live Line');
                      }}
                      className="w-full py-4 bg-rose-600 text-white rounded-xl font-bold text-[11px] tracking-widest uppercase hover:bg-rose-700 shadow-xl transition-all flex items-center justify-center space-x-3"
                    >
                      <Phone size={14} className="animate-pulse" /> <span>Alert Ali</span>
                    </button>
                  </div>
                )}

                {callPhase === 'idle' && (
                  <div className="h-full flex flex-col items-center justify-center opacity-10 grayscale space-y-4">
                    <Phone size={32} /> <p className="text-[9px] font-black uppercase tracking-widest">System Standby</p>
                  </div>
                )}
              </div>
            </div>
          </section>

          <section className="flex-1 flex flex-col bg-zinc-50/30">
            <div className="p-6 border-b border-zinc-200"><div className="flex items-center space-x-2 text-zinc-900"><Truck size={14} className="text-zinc-400" /> <span className="text-sm font-semibold">Fulfillment</span></div></div>
            <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar">
              {logisticsOrders.filter(o => !o.route).length > 0 && (
                <div className="space-y-3">
                  <p className="text-[8px] font-black text-zinc-400 uppercase tracking-widest px-2">Staging Area</p>
                  {logisticsOrders.filter(o => !o.route).map(order => (
                    <div key={order.id} className="bg-white border border-zinc-200 rounded-xl p-4 shadow-sm animate-in slide-in-from-right duration-300">
                      <div className="flex justify-between items-start mb-4">
                        <div><h4 className="font-bold text-xs text-zinc-900">{order.customerName}</h4><p className="text-[9px] text-zinc-400 font-bold uppercase">{order.city} • {order.items}</p></div>
                        <div className="bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded-full text-[7px] font-black flex items-center"><div className="w-1 h-1 bg-emerald-500 rounded-full mr-1.5" /> READY</div>
                      </div>
                      <button onClick={() => handleRouteLead(order.id, order.city)} className="w-full py-2 bg-zinc-100 border border-zinc-200 rounded-lg text-zinc-900 font-bold text-[9px] tracking-widest uppercase flex items-center justify-center space-x-2 hover:bg-zinc-200"><Navigation size={10} /> <span>Route: {order.city}</span></button>
                    </div>
                  ))}
                </div>
              )}
              {routes.filter(r => r.name !== 'Unassigned').map(route => (
                <div key={route.name} className="bg-white border border-zinc-200 rounded-xl overflow-hidden mb-6 shadow-sm">
                  <div className="bg-zinc-900 px-5 py-3 flex justify-between items-center text-white"><span className="text-[9px] font-black uppercase italic tracking-widest">{route.name}</span><span className="text-[8px] font-black font-mono opacity-50">{route.totalWeight}/{MAX_TRUCK_WEIGHT} LB</span></div>
                  <div className="p-4 space-y-2">{route.items.map(order => (<div key={order.id} className="flex justify-between items-center p-2 rounded-lg bg-zinc-50 border border-zinc-100 text-[11px]"><div className="flex items-center space-x-2"><span className="w-4 h-4 rounded bg-zinc-200 flex items-center justify-center text-[8px] font-black">{order.stopNumber}</span><span className="font-bold">{order.customerName}</span></div><span className="text-[6px] font-black text-zinc-300 uppercase">Routed</span></div>))}</div>
                </div>
              ))}
            </div>
          </section>
        </main>

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
