import { describe, expect, it } from "vitest";
import { displayEventName } from "./event-name";

describe("displayEventName", () => {
  it("title-cases names typed in capitals", () => {
    expect(displayEventName("SUMMERNATS NEW ZEALAND")).toBe("Summernats New Zealand");
    expect(displayEventName("NORTHERN NATS 11 STARRING TROPICAL MELTDOWN")).toBe("Northern Nats 11 Starring Tropical Meltdown");
    expect(displayEventName("SUMMERNATS NZ")).toBe("Summernats NZ");
    expect(displayEventName("THE BEST OF THE NSW SHOWS")).toBe("The Best of the NSW Shows");
    expect(displayEventName("NORTHERN NATS 11 Starring Tropical Meltdown")).toBe("Northern Nats 11 Starring Tropical Meltdown");
  });
  it("leaves mixed-case names alone", () => {
    expect(displayEventName("MEGA Burnout Day")).toBe("MEGA Burnout Day");
    expect(displayEventName("Castlemaine Rod Shop Invitational")).toBe("Castlemaine Rod Shop Invitational");
    expect(displayEventName("OTG")).toBe("OTG");
  });
});
