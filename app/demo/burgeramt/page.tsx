"use client";

import { useMemo, useState } from "react";
import { brand } from "@/app/lib/brand";

const demoSlots = [
  "Tue, 21 Apr 2026 at 08:10 - Burgeramt Mitte",
  "Tue, 21 Apr 2026 at 10:45 - Burgeramt Friedrichshain",
  "Wed, 22 Apr 2026 at 09:20 - Burgeramt Neukolln",
];

export default function DemoBurgeramtPage() {
  const [serviceType, setServiceType] = useState("Anmeldung einer Wohnung");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [searched, setSearched] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState(false);

  const reference = useMemo(() => {
    return `BG-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
  }, []);

  return (
    <main className="shell">
      <section className="hero harbor-hero">
        <div className="hero-top">
          <div className="brand-lockup">
            <div className="brand-mark" aria-hidden="true">
              H
            </div>
            <div>
              <p className="eyebrow">{brand.demo.eyebrow}</p>
              <p className="hero-tagline">{brand.tagline}</p>
            </div>
          </div>
        </div>

        <h1>{brand.demo.title}</h1>
        <p>
          {brand.demo.description}
        </p>
        <p>
          Harbor uses this page to fill inputs, search slots, review the booking, and
          pause before confirmation without depending on live-site reliability.
        </p>
      </section>

      <div className="demo-grid">
        <section className="panel strong panel-pad stack">
          <div>
            <label className="label" htmlFor="demo-service">
              Service
            </label>
            <select
              id="demo-service"
              data-testid="service-select"
              className="select"
              value={serviceType}
              onChange={(event) => setServiceType(event.target.value)}
            >
              <option>Anmeldung einer Wohnung</option>
              <option>Personalausweis beantragen</option>
              <option>Reisepass beantragen</option>
            </select>
          </div>

          <div>
            <label className="label" htmlFor="demo-name">
              Applicant Name
            </label>
            <input
              id="demo-name"
              data-testid="applicant-name"
              className="input"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Alex Example"
            />
          </div>

          <div>
            <label className="label" htmlFor="demo-email">
              Email
            </label>
            <input
              id="demo-email"
              data-testid="applicant-email"
              className="input"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="alex@example.com"
            />
          </div>

          <button
            className="button primary"
            data-testid="search-slots"
            onClick={() => {
              setSearched(true);
              setConfirmed(false);
            }}
            type="button"
          >
            Search appointments
          </button>

          {searched ? (
            <div className="demo-stage" data-testid="slot-stage">
              <strong>Available slots</strong>
              <div className="slots">
                {demoSlots.map((slot, index) => (
                  <button
                    key={slot}
                    type="button"
                    data-testid={`slot-option-${index}`}
                    className={`slot-button ${selectedSlot === slot ? "selected" : ""}`}
                    onClick={() => setSelectedSlot(slot)}
                  >
                    {slot}
                  </button>
                ))}
              </div>
            </div>
          ) : null}
        </section>

        <section className="panel panel-pad stack">
          <div className="demo-stage" data-testid="review-panel">
            <strong>Review</strong>
            <p className="muted">The executor will pause here before final submission.</p>
            <div className="chip-row">
              <span className="chip">
                <strong>Service</strong> {serviceType}
              </span>
              <span className="chip">
                <strong>Name</strong> {name || "Waiting"}
              </span>
              <span className="chip">
                <strong>Email</strong> {email || "Waiting"}
              </span>
              <span className="chip">
                <strong>Slot</strong> {selectedSlot || "Choose one"}
              </span>
            </div>
            <div className="button-row" style={{ marginTop: 16 }}>
              <button
                type="button"
                className="button secondary"
                data-testid="continue-review"
                onClick={() => setConfirmed(false)}
                disabled={!selectedSlot}
              >
                Continue to review
              </button>
              <button
                type="button"
                className="button primary"
                data-testid="confirm-booking"
                onClick={() => setConfirmed(true)}
                disabled={!selectedSlot || !name || !email}
              >
                Confirm booking
              </button>
            </div>
          </div>

          {confirmed ? (
            <div className="approval-card" data-testid="confirmation-state">
              <strong>Booking confirmed</strong>
              <p className="muted">
                Reference <span className="code">{reference}</span>
              </p>
              <p>
                {selectedSlot} for {name} ({email})
              </p>
            </div>
          ) : (
            <div className="approval-card" data-testid="waiting-state">
              <strong>Awaiting confirmation</strong>
              <p className="muted">
                This is the point where Harbor stops and asks the user to approve the
                irreversible action.
              </p>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
