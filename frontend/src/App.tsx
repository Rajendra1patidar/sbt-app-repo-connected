import React, { useState } from "react";
import { api } from "./lib/api";
import { AuthScreen } from "./components/AuthScreen";
import { InvoiceApp } from "./components/InvoiceApp";

export default function App() {
  const [authed, setAuthed] = useState<boolean>(!!api.getToken());
  if (!authed) return <AuthScreen onAuthed={() => setAuthed(true)} />;
  return <InvoiceApp onSignOut={() => { api.setToken(null); setAuthed(false); }} />;
}
