import { Outlet } from "react-router-dom";
import Sidebar from "./Sidebar";
import "./MainLayout.css";

export default function MainLayout() {
  return (
    <div className="wh-layout">
      <div className="wh-layout-wrapper">
        <Sidebar />
        <div className="wh-layout-main">
          <main className="wh-layout-content">
            <Outlet />
          </main>
        </div>
      </div>
    </div>
  );
}
