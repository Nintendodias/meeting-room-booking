// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, bookingsApi } from "@/lib/api/bookingsClient";
import type { Booking } from "@/lib/booking/types";
import { CONFLICT_MESSAGE } from "@/components/BookingForm/BookingForm";
import { BookingApp } from "./BookingApp";

vi.mock("@/lib/api/bookingsClient", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/bookingsClient")>();
  return {
    ...actual,
    bookingsApi: { list: vi.fn(), create: vi.fn(), update: vi.fn(), remove: vi.fn() },
  };
});

const api = vi.mocked(bookingsApi);
const TODAY = "2030-06-10";
const competing: Booking = { id: "other", date: TODAY, start: "09:30", end: "10:30", title: "Чужая встреча" };

beforeAll(() => {
  // jsdom does not implement modal dialogs.
  HTMLDialogElement.prototype.showModal ??= function (this: HTMLDialogElement) {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close ??= function (this: HTMLDialogElement) {
    this.removeAttribute("open");
  };
});

function setLocalTime(hours: number, minutes = 0) {
  vi.setSystemTime(new Date(2030, 5, 10, hours, minutes));
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  setLocalTime(8); // before the working day
  Object.values(api).forEach((mock) => mock.mockReset());
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

async function openCreateForm() {
  fireEvent.click(screen.getByRole("button", { name: "Создать бронирование" }));
  const dialog = screen.getByRole("dialog", { name: "Новое бронирование" });
  return { dialog, form: within(dialog) };
}

const inputValue = (element: HTMLElement) => (element as HTMLInputElement).value;

describe("BookingApp: HTTP 409 on create", () => {
  it("keeps the form open with entered values, shows the message and reloads the schedule", async () => {
    api.list.mockResolvedValueOnce([]).mockResolvedValueOnce([competing]);
    api.create.mockRejectedValueOnce(new ApiError("conflict"));

    render(<BookingApp />);
    expect(await screen.findByText(/бронирований нет/)).toBeTruthy();
    expect(api.list).toHaveBeenCalledWith(TODAY, expect.any(AbortSignal));

    const { dialog, form } = await openCreateForm();
    fireEvent.change(form.getByLabelText("Начало"), { target: { value: "09:45" } });
    fireEvent.change(form.getByLabelText(/Название встречи/), { target: { value: "Демо" } });

    await act(async () => {
      fireEvent.click(form.getByRole("button", { name: "Создать" }));
    });

    expect(api.create).toHaveBeenCalledTimes(1);
    expect(api.create).toHaveBeenCalledWith({ date: TODAY, start: "09:45", end: "10:45", title: "Демо" });

    expect((await form.findByRole("alert")).textContent).toContain(CONFLICT_MESSAGE);
    expect(screen.getByRole("dialog", { name: "Новое бронирование" })).toBe(dialog);
    expect(inputValue(form.getByLabelText("Дата"))).toBe(TODAY);
    expect(inputValue(form.getByLabelText("Начало"))).toBe("09:45");
    expect(inputValue(form.getByLabelText("Окончание"))).toBe("10:45");
    expect(inputValue(form.getByLabelText(/Название встречи/))).toBe("Демо");

    await waitFor(() => expect(api.list).toHaveBeenCalledTimes(2));
    expect(await screen.findByText("Чужая встреча")).toBeTruthy();
    expect((form.getByRole("button", { name: "Создать" }) as HTMLButtonElement).disabled).toBe(false);
  });
});

describe("BookingApp: successful create", () => {
  it("applies the saved booking locally without refetching and shows a toast", async () => {
    api.list.mockResolvedValueOnce([]);
    api.create.mockImplementationOnce(async (input) => ({ id: "new", ...input }));

    render(<BookingApp />);
    await screen.findByText(/бронирований нет/);

    const { form } = await openCreateForm();
    fireEvent.change(form.getByLabelText(/Название встречи/), { target: { value: "Демо" } });
    await act(async () => {
      fireEvent.click(form.getByRole("button", { name: "Создать" }));
    });

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByText("Демо")).toBeTruthy();
    expect(screen.getByText(/Бронирование создано/)).toBeTruthy();
    expect(api.list).toHaveBeenCalledTimes(1);
  });
});

describe("BookingApp: form behaviour", () => {
  it("moves the end time together with the start time", async () => {
    api.list.mockResolvedValueOnce([]);
    render(<BookingApp />);
    await screen.findByText(/бронирований нет/);

    const { form } = await openCreateForm();
    fireEvent.change(form.getByLabelText("Окончание"), { target: { value: "09:45" } });
    fireEvent.change(form.getByLabelText("Начало"), { target: { value: "13:20" } });

    expect(inputValue(form.getByLabelText("Окончание"))).toBe("14:05");
    expect(form.getByText(/Длительность: 45 мин/)).toBeTruthy();
  });

  it("does not call the API when client-side validation fails", async () => {
    api.list.mockResolvedValueOnce([]);
    render(<BookingApp />);
    await screen.findByText(/бронирований нет/);

    const { form } = await openCreateForm();
    fireEvent.change(form.getByLabelText("Окончание"), { target: { value: "09:10" } });
    fireEvent.click(form.getByRole("button", { name: "Создать" }));

    expect(form.getByText(/Минимальная длительность/)).toBeTruthy();
    expect(form.getByLabelText("Окончание").getAttribute("aria-invalid")).toBe("true");
    expect(api.create).not.toHaveBeenCalled();
  });
});

describe("BookingApp: past time", () => {
  it("hides the edit action for bookings that have already started", async () => {
    setLocalTime(12);
    api.list.mockResolvedValueOnce([
      { id: "past", date: TODAY, start: "10:00", end: "11:00", title: "Прошла" },
      { id: "next", date: TODAY, start: "14:00", end: "15:00", title: "Будет" },
    ]);
    render(<BookingApp />);
    await screen.findByText("Будет");

    expect(screen.queryByRole("button", { name: "Изменить бронирование 10:00–11:00" })).toBeNull();
    expect(screen.getByRole("button", { name: "Удалить бронирование 10:00–11:00" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Изменить бронирование 14:00–15:00" })).toBeTruthy();
    expect(screen.queryByText(/Свободно 09:00/)).toBeNull();
  });
});
