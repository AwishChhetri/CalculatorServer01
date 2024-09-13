const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const fs = require('fs').promises; // Use promises for fs

const app = express();

// Enable CORS and JSON middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Connect to MongoDB
mongoose.connect('mongodb+srv://abishchhetri2502:yeXrEIFsKZPdkohn@cluster0.jeau3.mongodb.net/studentdb?retryWrites=true&w=majority&appName=Cluster0', { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => console.log('Connected to MongoDB'))
  .catch(err => console.error('Failed to connect to MongoDB:', err));

// Define the vehicle schema, expanded to include EV-specific fields
const vehicleSchema = new mongoose.Schema({
  vehicleModel: { type: String, required: true },
  purchasePrice: { type: Number, required: true },
  fuelCost: { type: Number, required: true },
  maintenanceCost: { type: Number, required: true },
  insuranceCost: { type: Number, required: true },
  resaleValue: { type: Number, required: true },
  yearsOfOwnership: { type: Number, required: true },
  vehicleType: { type: String, enum: ['ICE', 'EV'], required: true },
  batteryCapacity: { type: Number },
  chargingCostPerKwh: { type: Number },
  batteryReplacementCost: { type: Number },
  batteryReplacementInterval: { type: Number }
});

// Create the Vehicle model
const Vehicle = mongoose.model('Vehicle', vehicleSchema);

// Calculate Total Cost of Ownership (TCO) for ICE and EV
app.post('/calculate', async (req, res) => {
    console.log("Request Body:", req.body);
    const {
        icePrice,
        iceMileage,
        fuelCost,
        evPrice,
        evRange,
        batteryCapacity,
        chargingCost,
        batteryReplacementCost,
        batteryReplacementInterval,
        monthlyKm,
        calculationDuration,
        considerBatteryReplacement
    } = req.body;
  
    try {
        let ice_tco, ev_tco;

        // ICE vehicle calculations
        const ICE_price = icePrice;
        const ICE_mileage = iceMileage || 12; // Default mileage if not provided
        const fuel_cost_per_liter = fuelCost;
        const ice_maintenance_cost_per_year = 500; // Assuming static value for ICE maintenance cost
        const ice_insurance_cost_per_year = 1000; // Assuming static value for ICE insurance cost
        const resale_value = 14000; // Assuming static resale value for ICE

        // Total Fuel Cost (ICE)
        const annual_fuel_cost = (monthlyKm * 12 / ICE_mileage) * fuel_cost_per_liter;
        const total_fuel_cost = annual_fuel_cost * calculationDuration;

        // Total Maintenance Cost (ICE)
        const total_ice_maintenance_cost = ice_maintenance_cost_per_year * calculationDuration;

        // Total Insurance Cost (ICE)
        const total_ice_insurance_cost = ice_insurance_cost_per_year * calculationDuration;

        // Total ICE Cost Calculation
        ice_tco = ICE_price + total_fuel_cost + total_ice_maintenance_cost + total_ice_insurance_cost - resale_value;

        // EV vehicle calculations
        const EV_price = evPrice;
        const true_range = evRange || 400; // Default range
        const ev_battery_capacity = batteryCapacity || 60; // kWh battery size
        const charging_cost_per_kwh = chargingCost || 0.15;
        const ev_battery_replacement_cost = batteryReplacementCost || 5000;
        const ev_battery_replacement_interval = batteryReplacementInterval || 8; // years

        // Total Electricity Cost (EV)
        const annual_charging_cost = (monthlyKm * 12 / true_range) * ev_battery_capacity * charging_cost_per_kwh;
        const total_ev_charging_cost = annual_charging_cost * calculationDuration;

        // Total Maintenance Cost (EV)
        const total_ev_maintenance_cost = 1000 * calculationDuration; // Assuming static maintenance cost for EV

        // Total Insurance Cost (EV)
        const total_ev_insurance_cost = 1200 * calculationDuration; // Assuming static insurance cost for EV

        // Total EV Cost Calculation
        ev_tco = EV_price + total_ev_charging_cost + total_ev_maintenance_cost + total_ev_insurance_cost;

        // Battery Replacement Logic
        if (considerBatteryReplacement && calculationDuration > ev_battery_replacement_interval) {
            const replacements = Math.floor(calculationDuration / ev_battery_replacement_interval);
            ev_tco += ev_battery_replacement_cost * replacements;
        }

        // Return both TCOs with detailed breakdown
        res.json({
            ice_tco: ice_tco || null,
            ev_tco: ev_tco || null,
            breakdown: {
                ice: {
                    purchasePrice: ICE_price,
                    fuelCost: total_fuel_cost,
                    maintenanceCost: total_ice_maintenance_cost,
                    insuranceCost: total_ice_insurance_cost,
                    resaleValue: resale_value,
                },
                ev: {
                    purchasePrice: EV_price,
                    chargingCost: total_ev_charging_cost,
                    maintenanceCost: total_ev_maintenance_cost,
                    insuranceCost: total_ev_insurance_cost,
                    batteryReplacementCost: considerBatteryReplacement && calculationDuration > ev_battery_replacement_interval 
                        ? Math.floor(calculationDuration / ev_battery_replacement_interval) * ev_battery_replacement_cost 
                        : 0,
                }
            }
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Server error' });
    }
});


// Insert Vehicle Data into MongoDB from JSON file
app.get('/insert', async (req, res) => {
  try {
    // Read data from the JSON file using fs.promises.readFile
    const data = await fs.readFile('jsondata.json', 'utf8').catch(err => {
      console.error("File read error:", err);
      return res.status(500).json({ error: 'Error reading vehicle data file' });
    });
  
    // Parse JSON data
    const vehicleDataArray = JSON.parse(data);
  
    // Loop through each vehicle entry and validate the required fields
    for (const vehicleData of vehicleDataArray) {
      const requiredFields = ['vehicleModel', 'purchasePrice', 'fuelCost', 'maintenanceCost', 'insuranceCost', 'resaleValue', 'yearsOfOwnership', 'vehicleType'];
      const missingFields = requiredFields.filter(field => vehicleData[field] === undefined || vehicleData[field] === null);
  
      if (missingFields.length > 0) {
        return res.status(400).json({ error: 'Validation failed for some fields', missingFields, vehicleData });
      }
  
      // Insert data into MongoDB
      const newVehicle = new Vehicle(vehicleData);
      const result = await newVehicle.save();
  
      // Log success for each inserted vehicle
      console.log('Data inserted successfully:', result);
    }
  
    // Send success response
    res.json({ message: 'All data inserted successfully' });
  } catch (error) {
    console.error('Error inserting data:', error);
    res.status(500).send('Error inserting data');
  }
});

// Start the server
const PORT = process.env.PORT || 8000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
