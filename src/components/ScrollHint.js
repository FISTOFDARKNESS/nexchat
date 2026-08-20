'use client';

import { useEffect, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';

export default function ScrollHint({ containerRef, label }) {
  const [visible, setVisible] = useState(false);
  const raf = useRef();

  const update = () => {
    const el = containerRef?.current;
    if (!el) return;
    const canScroll = el.scrollHeight > el.clientHeight + 16;
    const nearBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 24;
    setVisible(canScroll && !nearBottom);
  };

  useEffect(() => {
    const el = containerRef?.current;
    if (!el) return;
    const onScroll = () => {
      cancelAnimationFrame(raf.current);
      raf.current = requestAnimationFrame(update);
    };
    const onResize = () => setTimeout(update, 80);
    update();
    el.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onResize);
    const t = setTimeout(update, 400); 
    return () => {
      el.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onResize);
      cancelAnimationFrame(raf.current);
      clearTimeout(t);
    };
    
  }, [containerRef]);

  if (!visible) return null;

  return (
    <div style={{ position: 'absolute', bottom: 10, left: 0, right: 0, display: 'flex', justifyContent: 'center', zIndex: 30 }}>
      <span className="scroll-hint-pill">
        <ChevronDown size={14} />
        {label || 'Scroll'}
      </span>
    </div>
  );
}