import React from 'react';
import {
  LayoutDashboard,
  TrendingUp,
  Wallet,
  History,
  Settings,
  LogOut,
  LineChart
} from 'lucide-react';
import './Sidebar.css';

const SidebarItem = ({ icon: IconComponent, label, active, onClick }) => (
  <div
    className={`sidebar-item ${active ? 'active' : ''}`}
    onClick={onClick}
  >
    {IconComponent && <IconComponent size={20} />}
    <span>{label}</span>
  </div>
);

const Sidebar = ({ activeTab, setActiveTab }) => {
  const menuItems = [
    { id: 'dashboard', label: 'Panel', icon: LayoutDashboard },
    { id: 'market', label: 'Borsa', icon: LineChart },
    { id: 'portfolio', label: 'Portföy', icon: Wallet },
    { id: 'history', label: 'Geçmiş', icon: History },
  ];

  return (
    <div className="sidebar">
      <div className="sidebar-logo">
        <TrendingUp className="text-success" size={32} />
        <h1>BIST Sim</h1>
      </div>

      <div className="sidebar-menu">
        {menuItems.map(item => (
          <SidebarItem
            key={item.id}
            {...item}
            active={activeTab === item.id}
            onClick={() => setActiveTab(item.id)}
          />
        ))}
      </div>

      <div className="sidebar-footer">
        <SidebarItem icon={Settings} label="Ayarlar" />
        <SidebarItem icon={LogOut} label="Çıkış Yap" />
      </div>
    </div>
  );
};

export default Sidebar;
