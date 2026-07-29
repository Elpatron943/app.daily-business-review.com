import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { AuthProvider } from "./auth/AuthContext";
import { LocaleProvider } from "./i18n/LocaleContext";
import { ConfirmProvider } from "./ui/ConfirmDialog";
import { ToastProvider } from "./ui/Toast";
import { ConfigProvider } from "./config/ConfigContext";
import { DomainProvider } from "./domain/DomainContext";
import { AccountPlanProvider } from "./accountPlans/AccountPlanContext";
import { OpportunityProvider } from "./opportunities/OpportunityContext";
import { SalesProvider } from "./sales/SalesContext";
import { applyLocalResetIfNeeded } from "./resetLocalData";
import "./styles.css";

applyLocalResetIfNeeded();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <LocaleProvider>
      <ConfirmProvider>
        <ToastProvider>
        <AuthProvider>
          <ConfigProvider>
            <DomainProvider>
              <SalesProvider>
                <OpportunityProvider>
                  <AccountPlanProvider>
                    <App />
                  </AccountPlanProvider>
                </OpportunityProvider>
              </SalesProvider>
            </DomainProvider>
          </ConfigProvider>
        </AuthProvider>
        </ToastProvider>
      </ConfirmProvider>
    </LocaleProvider>
  </StrictMode>,
);
