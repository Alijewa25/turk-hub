import React from 'react';
import { Bell, BookOpen, Home, Rocket, User } from 'lucide-react';
import { useI18n } from '../i18n';

interface BottomNavProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
}

export const BottomNav: React.FC<BottomNavProps> = ({ activeTab, setActiveTab }) => {
  const { t } = useI18n();

  const navItems = [
    { id: 'home', label: t('navHome'), icon: Home },
    { id: 'dictionary', label: t('navDictionary'), icon: BookOpen },
    { id: 'projects', label: t('navProjects'), icon: Rocket },
    { id: 'notifications', label: t('navNotifications'), icon: Bell },
    { id: 'profile', label: t('navProfile'), icon: User },
  ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-black/95 backdrop-blur-md border-t border-neutral-900 px-2 py-2 flex justify-around items-center md:hidden">
      {navItems.map((item) => {
        const Icon = item.icon;
        const isActive = activeTab === item.id;
        return (
          <button
            key={item.id}
            onClick={() => setActiveTab(item.id)}
            className={`flex flex-col items-center justify-center w-full py-1 rounded-lg transition-colors duration-200 ${
              isActive ? 'text-skyBlue font-semibold' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Icon className={`w-6 h-6 ${isActive ? 'scale-110' : ''} transition-transform duration-200`} />
            <span className="text-[10px] mt-1">{item.label}</span>
          </button>
        );
      })}
    </nav>
  );
};