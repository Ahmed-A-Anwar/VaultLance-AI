/* Signup.tsx — "/signup": the account form card in the left column, beside the
   vault that VaultLayout keeps mounted. Slice 1 shell; the form lands in slice 3. */

export default function Signup() {
  return (
    <main id="main" className="signup-layout">
      <div className="signup-card" data-testid="signup-card">
        <h1 className="signup-h1">Open your vault.</h1>
        <p className="signup-sub">Pick your role. Create your account.</p>
      </div>
    </main>
  );
}
