package weather

import (
	"math"
)

// EarthRadiusMiles is the mean radius of Earth in statute miles
const EarthRadiusMiles = 3958.8

// HaversineDistanceMiles calculates the great-circle distance between two geographic coordinates
func HaversineDistanceMiles(c1, c2 Coordinates) float64 {
	lat1Rad := c1.Latitude * math.Pi / 180.0
	lon1Rad := c1.Longitude * math.Pi / 180.0
	lat2Rad := c2.Latitude * math.Pi / 180.0
	lon2Rad := c2.Longitude * math.Pi / 180.0

	dLat := lat2Rad - lat1Rad
	dLon := lon2Rad - lon1Rad

	a := math.Sin(dLat/2)*math.Sin(dLat/2) +
		math.Cos(lat1Rad)*math.Cos(lat2Rad)*
			math.Sin(dLon/2)*math.Sin(dLon/2)

	c := 2 * math.Atan2(math.Sqrt(a), math.Sqrt(1-a))

	return Round(EarthRadiusMiles*c, 2)
}
