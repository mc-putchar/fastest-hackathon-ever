import type { TaskInput } from "@/app/lib/domain";

export interface AppointmentSlot {
  startsAt: string;
  label: string;
}

export interface AppointmentProvider {
  id: string;
  name: string;
  appointmentKind: NonNullable<TaskInput["appointmentKind"]>;
  specialty?: string;
  location: string;
  insuranceTypes: Array<NonNullable<TaskInput["insuranceType"]>>;
  slots: AppointmentSlot[];
}

export const appointmentSpecialties = ["Dermatology", "Cardiology", "General practice"] as const;

const monthLabels = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function createSlot(date: string, time: string, weekday: string): AppointmentSlot {
  const [year, month, day] = date.split("-");
  return {
    startsAt: `${date}T${time}:00+02:00`,
    label: `${weekday}, ${day} ${monthLabels[Number(month) - 1]} ${year} at ${time}`,
  };
}

function createSlots(entries: Array<[date: string, time: string, weekday: string]>): AppointmentSlot[] {
  return entries
    .map(([date, time, weekday]) => createSlot(date, time, weekday))
    .sort((left, right) => left.startsAt.localeCompare(right.startsAt));
}

export const appointmentDemoProviders: AppointmentProvider[] = [
  {
    id: "dentist-smile-atelier",
    name: "Smile Atelier Mitte",
    appointmentKind: "dentist",
    location: "Berlin Mitte",
    insuranceTypes: ["public", "private", "self_pay"],
    slots: createSlots([
      ["2026-04-21", "08:10", "Tue"],
      ["2026-04-21", "10:20", "Tue"],
      ["2026-04-21", "12:30", "Tue"],
      ["2026-04-22", "09:40", "Wed"],
      ["2026-04-23", "14:10", "Thu"],
    ]),
  },
  {
    id: "dentist-zahnforum",
    name: "Zahnforum Prenzlauer Berg",
    appointmentKind: "dentist",
    location: "Prenzlauer Berg",
    insuranceTypes: ["private", "self_pay"],
    slots: createSlots([
      ["2026-04-21", "10:45", "Tue"],
      ["2026-04-21", "13:15", "Tue"],
      ["2026-04-22", "09:20", "Wed"],
      ["2026-04-22", "17:05", "Wed"],
      ["2026-04-24", "08:50", "Fri"],
    ]),
  },
  {
    id: "dentist-kanal-rooms",
    name: "Kanal Dental Rooms",
    appointmentKind: "dentist",
    location: "Berlin Kreuzberg",
    insuranceTypes: ["public", "private"],
    slots: createSlots([
      ["2026-04-21", "09:25", "Tue"],
      ["2026-04-21", "11:55", "Tue"],
      ["2026-04-22", "08:30", "Wed"],
      ["2026-04-23", "15:20", "Thu"],
    ]),
  },
  {
    id: "dentist-kudamm-loft",
    name: "Ku'damm Dental Loft",
    appointmentKind: "dentist",
    location: "Berlin Charlottenburg",
    insuranceTypes: ["private", "self_pay"],
    slots: createSlots([
      ["2026-04-21", "14:30", "Tue"],
      ["2026-04-22", "10:10", "Wed"],
      ["2026-04-23", "09:00", "Thu"],
      ["2026-04-24", "12:45", "Fri"],
    ]),
  },
  {
    id: "doctor-lenz-derm",
    name: "Praxis Dr. Lenz",
    appointmentKind: "doctor",
    specialty: "Dermatology",
    location: "Berlin Mitte",
    insuranceTypes: ["public", "private"],
    slots: createSlots([
      ["2026-04-21", "09:00", "Tue"],
      ["2026-04-21", "15:10", "Tue"],
      ["2026-04-22", "08:40", "Wed"],
      ["2026-04-23", "11:20", "Thu"],
      ["2026-04-24", "13:30", "Fri"],
    ]),
  },
  {
    id: "doctor-spree-derm",
    name: "Hautzentrum Spree",
    appointmentKind: "doctor",
    specialty: "Dermatology",
    location: "Berlin Friedrichshain",
    insuranceTypes: ["public", "self_pay"],
    slots: createSlots([
      ["2026-04-21", "10:35", "Tue"],
      ["2026-04-22", "09:10", "Wed"],
      ["2026-04-22", "14:25", "Wed"],
      ["2026-04-24", "10:50", "Fri"],
    ]),
  },
  {
    id: "doctor-nord-derm",
    name: "Nord Derm Clinic",
    appointmentKind: "doctor",
    specialty: "Dermatology",
    location: "Berlin Pankow",
    insuranceTypes: ["private", "self_pay"],
    slots: createSlots([
      ["2026-04-21", "11:50", "Tue"],
      ["2026-04-22", "12:20", "Wed"],
      ["2026-04-23", "08:45", "Thu"],
      ["2026-04-24", "16:15", "Fri"],
    ]),
  },
  {
    id: "doctor-elm-cardio",
    name: "Elm Heart Studio",
    appointmentKind: "doctor",
    specialty: "Cardiology",
    location: "Berlin Charlottenburg",
    insuranceTypes: ["private", "self_pay"],
    slots: createSlots([
      ["2026-04-21", "11:15", "Tue"],
      ["2026-04-22", "10:30", "Wed"],
      ["2026-04-23", "14:00", "Thu"],
      ["2026-04-24", "09:35", "Fri"],
    ]),
  },
  {
    id: "doctor-tiergarten-cardio",
    name: "Kardiologie am Tiergarten",
    appointmentKind: "doctor",
    specialty: "Cardiology",
    location: "Berlin Tiergarten",
    insuranceTypes: ["public", "private"],
    slots: createSlots([
      ["2026-04-21", "12:05", "Tue"],
      ["2026-04-22", "08:20", "Wed"],
      ["2026-04-23", "10:55", "Thu"],
      ["2026-04-24", "15:40", "Fri"],
    ]),
  },
  {
    id: "doctor-pulse-cardio",
    name: "Pulse Harbor Cardio",
    appointmentKind: "doctor",
    specialty: "Cardiology",
    location: "Berlin Schoneberg",
    insuranceTypes: ["public", "self_pay"],
    slots: createSlots([
      ["2026-04-21", "16:20", "Tue"],
      ["2026-04-22", "11:45", "Wed"],
      ["2026-04-23", "09:25", "Thu"],
      ["2026-04-24", "13:10", "Fri"],
    ]),
  },
  {
    id: "doctor-havel-general",
    name: "Havel Family Practice",
    appointmentKind: "doctor",
    specialty: "General practice",
    location: "Berlin Neukolln",
    insuranceTypes: ["public", "self_pay"],
    slots: createSlots([
      ["2026-04-21", "08:40", "Tue"],
      ["2026-04-21", "16:10", "Tue"],
      ["2026-04-22", "09:55", "Wed"],
      ["2026-04-23", "08:15", "Thu"],
      ["2026-04-24", "11:30", "Fri"],
    ]),
  },
  {
    id: "doctor-riverside-general",
    name: "Riverside Medical Desk",
    appointmentKind: "doctor",
    specialty: "General practice",
    location: "Berlin Moabit",
    insuranceTypes: ["public", "private"],
    slots: createSlots([
      ["2026-04-21", "09:35", "Tue"],
      ["2026-04-21", "13:50", "Tue"],
      ["2026-04-22", "10:45", "Wed"],
      ["2026-04-23", "12:10", "Thu"],
    ]),
  },
  {
    id: "doctor-ostkreuz-general",
    name: "Hausarzt am Ostkreuz",
    appointmentKind: "doctor",
    specialty: "General practice",
    location: "Berlin Friedrichshain",
    insuranceTypes: ["private", "self_pay"],
    slots: createSlots([
      ["2026-04-21", "10:15", "Tue"],
      ["2026-04-22", "08:05", "Wed"],
      ["2026-04-23", "14:40", "Thu"],
      ["2026-04-24", "09:20", "Fri"],
    ]),
  },
];

export function matchingAppointmentProviders(input: Pick<TaskInput, "appointmentKind" | "specialty" | "insuranceType">) {
  return appointmentDemoProviders
    .filter((provider) => {
      if (input.appointmentKind && provider.appointmentKind !== input.appointmentKind) {
        return false;
      }

      if (provider.appointmentKind === "doctor" && input.specialty && provider.specialty !== input.specialty) {
        return false;
      }

      if (input.insuranceType && !provider.insuranceTypes.includes(input.insuranceType)) {
        return false;
      }

      return true;
    })
    .sort((left, right) => left.slots[0].startsAt.localeCompare(right.slots[0].startsAt));
}

export function earliestAppointmentMatch(input: Pick<TaskInput, "appointmentKind" | "specialty" | "insuranceType">) {
  const provider = matchingAppointmentProviders(input)[0];
  if (!provider) {
    return null;
  }

  return {
    provider,
    slot: provider.slots[0],
  };
}
