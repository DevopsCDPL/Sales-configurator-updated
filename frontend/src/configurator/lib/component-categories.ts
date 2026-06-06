// Component categories for the application
export const COMPONENT_CATEGORIES = {
  // Real component categories from the list
  CAMLOCK: 'CAMLOCK',
  CONDUIT: 'CONDUIT',
  CONTROLS: 'CONTROLS',
  CURRENT_TRANSFORMER: 'CURRENT TRANSFORMER',
  VOLTAGE_TRANSFORMER: 'VOLTAGE TRANSFORMER',
  ENCLOSURE: 'ENCLOSURE',
  GLASTIC: 'GLASTIC',
  HARDWARE: 'HARDWARE',
  LABOR: 'LABOR',
  LIGHT: 'LIGHT',
  LUGS: 'LUGS',
  POWER_SUPPLY: 'POWER SUPPLY',
  SWITCH: 'SWITCH',
  TERMINALS: 'TERMINALS',
  WIRE_CABLE: 'WIRE CABLE',
  CIRCUIT_BREAKER: 'CIRCUIT BREAKER',
  SPD: 'SPD',
  ATS: 'ATS',
  STANDARD_PRODUCT: 'STANDARD PRODUCT'
};

// Helper function to get friendly component category name
export const getFriendlyCategoryName = (category: string): string => {
  switch (category) {
    case COMPONENT_CATEGORIES.CAMLOCK:
      return 'CAMLOCK Connectors';
    case COMPONENT_CATEGORIES.CONDUIT:
      return 'Conduit & Fittings';
    case COMPONENT_CATEGORIES.CONTROLS:
      return 'Control Systems';
    case COMPONENT_CATEGORIES.CURRENT_TRANSFORMER:
      return 'Current Transformers';
    case COMPONENT_CATEGORIES.VOLTAGE_TRANSFORMER:
      return 'Voltage Transformers';
    case COMPONENT_CATEGORIES.ENCLOSURE:
      return 'Enclosures';
    case COMPONENT_CATEGORIES.GLASTIC:
      return 'Glastic Components';
    case COMPONENT_CATEGORIES.HARDWARE:
      return 'Hardware';
    case COMPONENT_CATEGORIES.LABOR:
      return 'Labor';
    case COMPONENT_CATEGORIES.LIGHT:
      return 'Lighting';
    case COMPONENT_CATEGORIES.LUGS:
      return 'Lugs';
    case COMPONENT_CATEGORIES.POWER_SUPPLY:
      return 'Power Supplies';
    case COMPONENT_CATEGORIES.SWITCH:
      return 'Switches';
    case COMPONENT_CATEGORIES.TERMINALS:
      return 'Terminals';
    case COMPONENT_CATEGORIES.WIRE_CABLE:
      return 'Wire & Cable';
    case COMPONENT_CATEGORIES.CIRCUIT_BREAKER:
      return 'Circuit Breakers';
    case COMPONENT_CATEGORIES.SPD:
      return 'Surge Protection Devices';
    case COMPONENT_CATEGORIES.ATS:
      return 'Automatic Transfer Switches';
    case COMPONENT_CATEGORIES.STANDARD_PRODUCT:
      return 'Standard Products';
    default:
      return category;
  }
};
