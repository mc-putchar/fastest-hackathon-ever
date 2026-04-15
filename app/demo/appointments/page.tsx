"use client";

import { useMemo, useState } from "react";
import { appointmentSpecialties, matchingAppointmentProviders } from "@/app/lib/appointment-demo-data";
import { brand } from "@/app/lib/brand";

export default function DemoAppointmentsPage() {
  const [appointmentKind, setAppointmentKind] = useState<"doctor" | "dentist">("dentist");
  const [specialty, setSpecialty] = useState<(typeof appointmentSpecialties)[number]>("Dermatology");
  const [insuranceType, setInsuranceType] = useState<"public" | "private" | "self_pay">("public");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [searched, setSearched] = useState(false);
  const [selectedProviderId, setSelectedProviderId] = useState<string | null>(null);
  const [selectedSlotStartsAt, setSelectedSlotStartsAt] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState(false);

  const results = useMemo(() => {
    if (!searched) {
      return [];
    }

    return matchingAppointmentProviders({
      appointmentKind,
      specialty: appointmentKind === "doctor" ? specialty : undefined,
      insuranceType,
    });
  }, [appointmentKind, insuranceType, searched, specialty]);

  const selectedProvider = results.find((provider) => provider.id === selectedProviderId) ?? null;
  const selectedSlot =
    selectedProvider?.slots.find((slot) => slot.startsAt === selectedSlotStartsAt) ?? selectedProvider?.slots[0] ?? null;

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
        <p>{brand.demo.description}</p>
        <p>
          Harbor uses this page to set filters, compare providers, select the earliest slot, and
          pause before the final confirmation without depending on live provider sites.
        </p>
      </section>

      <div className="demo-grid">
        <section className="panel strong panel-pad stack">
          <div>
            <label className="label" htmlFor="demo-kind">
              Appointment type
            </label>
            <select
              id="demo-kind"
              data-testid="appointment-kind-select"
              className="select"
              value={appointmentKind}
              onChange={(event) => {
                const nextKind = event.target.value as "doctor" | "dentist";
                setAppointmentKind(nextKind);
                setSelectedProviderId(null);
                setSelectedSlotStartsAt(null);
                setConfirmed(false);
              }}
            >
              <option value="dentist">Dentist</option>
              <option value="doctor">Doctor</option>
            </select>
          </div>

          <div>
            <label className="label" htmlFor="demo-specialty">
              Specialty
            </label>
            <select
              id="demo-specialty"
              data-testid="specialty-select"
              className="select"
              value={specialty}
              onChange={(event) => {
                setSpecialty(event.target.value as (typeof appointmentSpecialties)[number]);
                setSelectedProviderId(null);
                setSelectedSlotStartsAt(null);
                setConfirmed(false);
              }}
              disabled={appointmentKind !== "doctor"}
            >
              {appointmentSpecialties.map((entry) => (
                <option key={entry} value={entry}>
                  {entry}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="label" htmlFor="demo-insurance">
              Insurance
            </label>
            <select
              id="demo-insurance"
              data-testid="insurance-select"
              className="select"
              value={insuranceType}
              onChange={(event) => {
                setInsuranceType(event.target.value as "public" | "private" | "self_pay");
                setSelectedProviderId(null);
                setSelectedSlotStartsAt(null);
                setConfirmed(false);
              }}
            >
              <option value="public">Public insurance</option>
              <option value="private">Private insurance</option>
              <option value="self_pay">Self pay</option>
            </select>
          </div>

          <div>
            <label className="label" htmlFor="demo-name">
              Patient name
            </label>
            <input
              id="demo-name"
              data-testid="patient-name"
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
              data-testid="patient-email"
              className="input"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="alex@example.com"
            />
          </div>

          <button
            className="button primary"
            data-testid="search-appointments"
            onClick={() => {
              setSearched(true);
              setSelectedProviderId(null);
              setSelectedSlotStartsAt(null);
              setConfirmed(false);
            }}
            type="button"
          >
            Search appointments
          </button>

          {searched ? (
            <div className="demo-stage" data-testid="results-stage">
              <strong>Available providers</strong>
              {results.length > 0 ? (
                <div className="slots">
                  {results.map((provider, index) => (
                    <article
                      key={provider.id}
                      data-testid={`provider-card-${index}`}
                      data-provider-name={provider.name}
                      className={`approval-card ${selectedProviderId === provider.id ? "selected-provider" : ""}`}
                    >
                      <strong>
                        {provider.name}
                        {provider.specialty ? ` · ${provider.specialty}` : ""}
                      </strong>
                      <p className="muted">
                        {provider.location} · accepts {provider.insuranceTypes.join(", ")}
                      </p>
                      <p className="muted">{provider.slots.length} open slots in the mock workflow</p>
                      <div className="slot-list">
                        {provider.slots.map((slot, slotIndex) => {
                          const isSelected =
                            selectedProviderId === provider.id && selectedSlot?.startsAt === slot.startsAt;
                          return (
                            <button
                              key={slot.startsAt}
                              type="button"
                              data-testid={slotIndex === 0 ? `slot-option-${index}` : `slot-option-${index}-${slotIndex}`}
                              data-slot-label={slot.label}
                              className={`slot-button ${isSelected ? "selected" : ""}`}
                              onClick={() => {
                                setSelectedProviderId(provider.id);
                                setSelectedSlotStartsAt(slot.startsAt);
                                setConfirmed(false);
                              }}
                            >
                              {slot.label}
                            </button>
                          );
                        })}
                      </div>
                    </article>
                  ))}
                </div>
              ) : (
                <div className="approval-card" data-testid="no-results">
                  <strong>No matching providers</strong>
                  <p className="muted">
                    Adjust the specialty or insurance filters to widen the search.
                  </p>
                </div>
              )}
            </div>
          ) : null}
        </section>

        <section className="panel panel-pad stack">
          <div className="demo-stage" data-testid="review-panel">
            <strong>Review</strong>
            <p className="muted">The executor will pause here before the final booking confirmation.</p>
            <div className="chip-row">
              <span className="chip">
                <strong>Type</strong> {appointmentKind}
              </span>
              <span className="chip">
                <strong>Specialty</strong> {appointmentKind === "doctor" ? specialty : "Not needed"}
              </span>
              <span className="chip">
                <strong>Insurance</strong> {insuranceType}
              </span>
              <span className="chip">
                <strong>Name</strong> {name || "Waiting"}
              </span>
              <span className="chip">
                <strong>Email</strong> {email || "Waiting"}
              </span>
              <span className="chip">
                <strong>Provider</strong> {selectedProvider?.name || "Choose one"}
              </span>
              <span className="chip">
                <strong>Slot</strong> {selectedSlot?.label || "Choose one"}
              </span>
            </div>
            <div className="button-row" style={{ marginTop: 16 }}>
              <button
                type="button"
                className="button secondary"
                data-testid="continue-review"
                onClick={() => setConfirmed(false)}
                disabled={!selectedProvider || !selectedSlot}
              >
                Continue to review
              </button>
              <button
                type="button"
                className="button primary"
                data-testid="confirm-booking"
                onClick={() => setConfirmed(true)}
                disabled={!selectedProvider || !selectedSlot || !name || !email}
              >
                Confirm booking
              </button>
            </div>
          </div>

          {confirmed && selectedProvider && selectedSlot ? (
            <div className="approval-card" data-testid="confirmation-state">
              <strong>Appointment confirmed</strong>
              <p className="muted">
                {selectedProvider.name} · {selectedSlot.label}
              </p>
              <p>
                Booking held for {name} ({email})
              </p>
            </div>
          ) : (
            <div className="approval-card" data-testid="waiting-state">
              <strong>Awaiting confirmation</strong>
              <p className="muted">
                This is the point where Harbor stops and asks the user to approve the irreversible
                booking step.
              </p>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
