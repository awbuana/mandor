import { ReactNode } from 'react';
import { motion } from 'framer-motion';

interface AppShellProps {
  children: ReactNode;
}

export function AppShell({ children }: AppShellProps) {
  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3 }}
      className="h-full w-full flex flex-col bg-slate-950"
    >
      {children}
    </motion.div>
  );
}
