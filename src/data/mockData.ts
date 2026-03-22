export interface Lead {
  id: string;
  name: string;
  type: string;
  address: string;
  city: string;
  lat: number;
  lng: number;
  favoredProduct: string;
  secondaryProduct: string;
  monthly_volume_lbs: number;
  sentiment?: number;
  isWholesaler: boolean;
  marginPotential: 'High' | 'Standard';
  status: 'Incoming Queue' | 'Ready' | 'Follow-up' | 'Not Interested' | 'Escalated' | 'Drip';
  nextContactDate?: string;
  hasNegativeSentiment?: boolean;
}

export const mockLeads: Lead[] = [
  {
    id: '1',
    name: 'Sunrise Artisan Bakery',
    type: 'Bakery',
    address: '123 Main St, Mineola, NY',
    city: 'Mineola',
    lat: 40.7484,
    lng: -73.6407,
    favoredProduct: '50lb Sesame Seeds',
    secondaryProduct: '25lb Poppy Seeds',
    monthly_volume_lbs: 250,
    isWholesaler: false,
    marginPotential: 'Standard',
    status: 'Incoming Queue',
  },
  {
    id: '2',
    name: 'Hempstead Hearth',
    type: 'Industrial Bakery',
    address: '500 Fulton Ave, Hempstead, NY',
    city: 'Hempstead',
    lat: 40.7062,
    lng: -73.6187,
    favoredProduct: '500lb Cinnamon Bulk',
    secondaryProduct: '200lb Raisins',
    monthly_volume_lbs: 1200,
    isWholesaler: true,
    marginPotential: 'High',
    status: 'Escalated',
  },
  {
    id: '3',
    name: 'Long Island Bagel Co.',
    type: 'Bagel Chain',
    address: '456 Garden City Plaza, NY',
    city: 'Garden City',
    lat: 40.7267,
    lng: -73.5912,
    favoredProduct: '100lb Walnuts',
    secondaryProduct: '50lb Cashews',
    monthly_volume_lbs: 600,
    isWholesaler: false,
    marginPotential: 'Standard',
    status: 'Incoming Queue',
  },
  {
    id: '4',
    name: 'North Shore Boulangerie',
    type: 'Luxury Bakery',
    address: '555 Port Washington Blvd, NY',
    city: 'Port Washington',
    lat: 40.8257,
    lng: -73.6982,
    favoredProduct: '200lb Raisins',
    secondaryProduct: '100lb Dried Cranberries',
    monthly_volume_lbs: 550,
    isWholesaler: true,
    marginPotential: 'High',
    status: 'Drip',
  },
  {
    id: '5',
    name: 'The Rolling Pin',
    type: 'Bakery',
    address: '321 Westbury Ave, NY',
    city: 'Westbury',
    lat: 40.7562,
    lng: -73.5812,
    favoredProduct: '50lb Pumpkin Seeds',
    secondaryProduct: '25lb Sunflower Seeds',
    monthly_volume_lbs: 300,
    isWholesaler: false,
    marginPotential: 'Standard',
    status: 'Incoming Queue',
    hasNegativeSentiment: true,
  },
  {
    id: '6',
    name: 'Old World Bakery',
    type: 'Bakery',
    address: '123 Main St, Mineola, NY',
    city: 'Mineola',
    lat: 40.7484,
    lng: -73.6407,
    favoredProduct: '150lb Raisins',
    secondaryProduct: '50lb Walnuts',
    monthly_volume_lbs: 400,
    isWholesaler: false,
    marginPotential: 'Standard',
    status: 'Incoming Queue',
  },
];

export interface Order {
  id: string;
  customerName: string;
  items: string;
  weight_lbs: number;
  city: string;
  lat: number;
  lng: number;
  route: string;
  status: 'Ready' | 'Routed' | 'Out for Delivery';
  stopNumber?: number;
}

export const mockOrders: Order[] = [];
