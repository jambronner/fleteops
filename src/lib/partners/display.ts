type ContactLabelInput = {
  fullName?: string | null;
  displayName?: string | null;
};

type WhatsappParticipantDisplayInput = {
  unknownLabel: string;
  participant: {
    displayName?: string | null;
    phoneNumber?: string | null;
    participantKey: string;
    contact?: {
      label?: string | null;
    } | null;
  };
};

type OrganizationNameInput = {
  legalName: string;
  displayName?: string | null;
};

type LocationNameInput = {
  name: string;
};

const directoryNameCollator = new Intl.Collator("es-MX", {
  sensitivity: "base",
  numeric: true,
});

export function getDirectoryContactLabel(contact: ContactLabelInput) {
  return contact.displayName || contact.fullName || null;
}

export function getWhatsappParticipantDisplayName({
  unknownLabel,
  participant,
}: WhatsappParticipantDisplayInput) {
  return (
    participant.contact?.label ||
    participant.displayName ||
    unknownLabel
  );
}

export function getOrganizationDisplayName(organization: OrganizationNameInput) {
  return organization.displayName || organization.legalName;
}

export function sortPartnerOrganizationsByName<T extends OrganizationNameInput>(organizations: T[]) {
  return [...organizations].sort((left, right) =>
    directoryNameCollator.compare(getOrganizationDisplayName(left), getOrganizationDisplayName(right)),
  );
}

export function sortPartnerLocationsByName<T extends LocationNameInput>(locations: T[]) {
  return [...locations].sort((left, right) => directoryNameCollator.compare(left.name, right.name));
}
