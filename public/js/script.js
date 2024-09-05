
const map = L.map('map').setView([37.802420, -122.421620], 13);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  attribution: '&copy; OpenStreetMap contributors'
}).addTo(map);


let propertyMarkers = []; 

function showSidebar(property) {
  const sidebar = document.getElementById('sidebar');
  sidebar.style.display = 'block';
  document.getElementById('property-name').innerText = property.PropertyName;
  document.getElementById('property-details').innerText = property.Details;
  document.getElementById('lease-duration').innerText = `Lease Duration: ${property.LeaseDuration}`;
  document.getElementById('total-earnings').innerText = `Monthly Rent: ${property.MonthlyRent}`;

  const existingButton = document.getElementById('remove-property-button');
  if (existingButton) {
    existingButton.parentNode.removeChild(existingButton);
  }

  const removeButton = document.createElement('button');
  removeButton.id = 'remove-property-button';
  removeButton.innerText = 'Remove Property';
  removeButton.style.marginTop = '20px';
  removeButton.style.backgroundColor = '#ff4d4d';
  removeButton.style.color = 'white';
  removeButton.style.border = 'none';
  removeButton.style.padding = '10px';
  removeButton.style.cursor = 'pointer';

  removeButton.addEventListener('click', () => {
    removeProperty(property);
    sidebar.style.display = 'none'; 
  });

  sidebar.appendChild(removeButton);
}


function removeProperty(property) {
  fetch(`/delete-property/${property.PropertyID}`, { method: 'DELETE' })
      .then(response => {
          if (response.ok) {
              const marker = propertyMarkers.find(marker => marker.propertyID === property.PropertyID);
              if (marker) {
                  map.removeLayer(marker.marker);
                  propertyMarkers = propertyMarkers.filter(m => m.propertyID !== property.PropertyID);
              }
          } else {
              console.error('Failed to remove property from the database');
          }
      })
      .catch(error => console.error('Error removing property:', error));
}

function dismissTicket(ticketId) {
}

document.getElementById('close-btn').addEventListener('click', () => {
  document.getElementById('sidebar').style.display = 'none';
});

document.getElementById('add-property-btn').addEventListener('click', () => {
  document.getElementById('add-property-form').style.display = 'block';
});

document.getElementById('close-form-btn').addEventListener('click', () => {
  document.getElementById('add-property-form').style.display = 'none';
});

async function geocodeAddress(address) {
  const response = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(address)}`);
  const data = await response.json();
  
  if (data.length === 0) {
    throw new Error('Address not found');
  }
  
  return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
}

document.getElementById('property-form').addEventListener('submit', async (event) => {
  event.preventDefault();

  const address = document.getElementById('address').value;
  const name = document.getElementById('name').value;
  const details = document.getElementById('details').value;
  const leaseDuration = document.getElementById('leaseDuration').value;
  const monthlyRent = document.getElementById('totalEarnings').value;
  const tenantName = document.getElementById('tenant-input').value;

  try {
    const { lat, lng } = await geocodeAddress(address);

    const response = await fetch('/add-property', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        address,
        name,
        details,
        leaseDuration,
        monthlyRent,
        tenantName,
        lat,
        lng
      })
    });

    if (response.ok) {
      console.log('Property added to the database');
      loadProperties();
    } else {
      console.error('Failed to add property to the database');
    }

    document.getElementById('add-property-form').style.display = 'none';
    document.getElementById('property-form').reset();
  } catch (error) {
    alert('Failed to geocode address: ' + error.message);
  }
});

document.getElementById('tenant-input').addEventListener('input', async function() {
  const query = this.value;

  if (query.length < 2) {
      document.getElementById('tenant-dropdown').style.display = 'none';
      return;
  }

  try {
      const response = await fetch('/get-accepted-tenants');
      if (!response.ok) {
          throw new Error('Failed to fetch tenants');
      }
      const tenants = await response.json();
      const dropdown = document.getElementById('tenant-dropdown');
      dropdown.innerHTML = '';

      tenants.forEach(tenant => {
          if (tenant.Username.toLowerCase().includes(query.toLowerCase())) {
              const li = document.createElement('li');
              li.textContent = tenant.Username;
              li.addEventListener('click', () => {
                  document.getElementById('tenant-input').value = tenant.Username;
                  dropdown.style.display = 'none'; 
              });
              dropdown.appendChild(li);
          }
      });

      dropdown.style.display = tenants.length > 0 ? 'block' : 'none'; 

  } catch (error) {
      console.error('Error fetching tenants:', error);
  }
});

async function loadProperties() {
    try {
        const response = await fetch('/get-properties');
        const properties = await response.json();

        properties.forEach(property => {
            const marker = L.marker([property.Latitude, property.Longitude]).addTo(map);
            marker.propertyID = property.PropertyID;
            marker.on('click', () => {
                showSidebar(property);
            });
            propertyMarkers.push({ marker, propertyID: property.PropertyID });
        });
    } catch (error) {
        console.error('Error loading properties:', error);
    }
}

loadProperties();
