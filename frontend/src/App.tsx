import React, { useState } from "react";
import { BrowserRouter } from "react-router-dom";
import { api } from "./lib/api";
import { AuthScreen } from "./Components/AuthScreen";
import { InvoiceApp } from "./Components/InvoiceApp";

export default function App() {
  const [authed, setAuthed] = useState<boolean>(!!api.getToken());
  if (!authed) return <AuthScreen onAuthed={() => setAuthed(true)} />;
  return (
    <BrowserRouter>
      <InvoiceApp onSignOut={() => { api.setToken(null); setAuthed(false); }} />
    </BrowserRouter>
  );
}
