// Sample idea bank. Generic on purpose: each couple edits these or adds their own in the app.
// cost: [min, max] for two people in dollars. drive: minutes one way (0 = at home).
// seasons: any of Winter, Spring, Summer, Fall, or ['Any'].
// energy: Low | Med | High. leans: 'Both' or one partner's name (set in the app).

export const TAG_GROUPS = {
  food: ['burgers', 'chinese', 'steak', 'greek', 'diner', 'treats', 'cook-at-home', 'picnic'],
  activity: ['outdoors', 'walk', 'indoors', 'at-home', 'show', 'holiday', 'active', 'games', 'drive', 'day-trip', 'museum'],
};

export const SEED_IDEAS = [
  { id: 'g01', title: 'Burger drive-in, eat in the car', cost: [25, 35], drive: 20, seasons: ['Any'], energy: 'Low', leans: 'Both', tags: ['burgers', 'indoors'] },
  { id: 'g02', title: 'Chinese takeout + movie at home', cost: [20, 30], drive: 0, seasons: ['Any'], energy: 'Low', leans: 'Both', tags: ['chinese', 'at-home'] },
  { id: 'g03', title: 'Steakhouse night', cost: [40, 60], drive: 25, seasons: ['Any'], energy: 'Low', leans: 'Both', tags: ['steak', 'indoors'] },
  { id: 'g04', title: "Breakfast-for-dinner at a diner you haven't tried", cost: [20, 30], drive: 20, seasons: ['Any'], energy: 'Low', leans: 'Both', tags: ['diner', 'indoors'] },
  { id: 'g05', title: 'Mediterranean dinner out', cost: [30, 45], drive: 20, seasons: ['Any'], energy: 'Low', leans: 'Both', tags: ['greek', 'indoors'] },
  { id: 'g06', title: 'Cook a fancy dinner together at home', cost: [25, 35], drive: 0, seasons: ['Any'], energy: 'Med', leans: 'Both', tags: ['steak', 'cook-at-home', 'at-home'] },
  { id: 'g07', title: 'Bowling + cheap fries', cost: [30, 40], drive: 18, seasons: ['Any'], energy: 'Med', leans: 'Both', tags: ['games', 'indoors', 'active'] },
  { id: 'g08', title: 'Fast-food treat + drive with a playlist', cost: [10, 15], drive: 10, seasons: ['Any'], energy: 'Low', leans: 'Both', tags: ['treats', 'drive'] },
  { id: 'g09', title: 'Board game or puzzle night with snacks', cost: [10, 20], drive: 0, seasons: ['Any'], energy: 'Low', leans: 'Both', tags: ['games', 'at-home', 'treats'] },
  { id: 'g10', title: 'Zoo or garden holiday light show', cost: [40, 50], drive: 25, seasons: ['Winter'], energy: 'Med', leans: 'Both', tags: ['holiday', 'outdoors', 'walk'] },
  { id: 'g11', title: 'Holiday tour of a historic house', cost: [50, 80], drive: 30, seasons: ['Winter'], energy: 'Med', leans: 'Both', tags: ['holiday', 'indoors', 'museum'], special: true },
  { id: 'g12', title: 'Christmas lights drive + hot chocolate', cost: [5, 10], drive: 10, seasons: ['Winter'], energy: 'Low', leans: 'Both', tags: ['holiday', 'drive', 'treats'] },
  { id: 'g13', title: 'Public ice skating', cost: [20, 30], drive: 20, seasons: ['Winter'], energy: 'High', leans: 'Both', tags: ['active', 'indoors'] },
  { id: 'g14', title: 'Downtown stroll + dessert', cost: [15, 25], drive: 15, seasons: ['Any'], energy: 'Med', leans: 'Both', tags: ['walk', 'treats', 'outdoors'] },
  { id: 'g15', title: 'Art museum, then dinner', cost: [0, 45], drive: 25, seasons: ['Any'], energy: 'Low', leans: 'Both', tags: ['museum', 'indoors'] },
  { id: 'g16', title: 'Lake trail walk + diner after', cost: [20, 30], drive: 30, seasons: ['Spring', 'Summer', 'Fall'], energy: 'Med', leans: 'Both', tags: ['walk', 'outdoors', 'diner'] },
  { id: 'g17', title: 'Park walk + ice cream', cost: [10, 15], drive: 15, seasons: ['Spring', 'Summer', 'Fall'], energy: 'Med', leans: 'Both', tags: ['walk', 'outdoors', 'treats'] },
  { id: 'g18', title: 'Neighborhood walk + takeout at home', cost: [20, 30], drive: 0, seasons: ['Spring', 'Summer', 'Fall'], energy: 'Low', leans: 'Both', tags: ['walk', 'outdoors', 'at-home'] },
  { id: 'g19', title: 'Waterfall hike, then burgers', cost: [25, 35], drive: 40, seasons: ['Spring', 'Summer', 'Fall'], energy: 'Med', leans: 'Both', tags: ['walk', 'outdoors', 'burgers'] },
  { id: 'g20', title: 'Sunset picnic', cost: [15, 20], drive: 20, seasons: ['Summer'], energy: 'Low', leans: 'Both', tags: ['picnic', 'outdoors'] },
  { id: 'g21', title: 'Kayak or canoe rental', cost: [30, 50], drive: 30, seasons: ['Summer'], energy: 'High', leans: 'Both', tags: ['active', 'outdoors'] },
  { id: 'g22', title: 'Mini golf + ice cream', cost: [25, 35], drive: 18, seasons: ['Summer'], energy: 'Med', leans: 'Both', tags: ['games', 'outdoors', 'treats'] },
  { id: 'g23', title: 'Drive-in movie theater', cost: [20, 30], drive: 30, seasons: ['Summer'], energy: 'Low', leans: 'Both', tags: ['show', 'outdoors', 'treats'] },
  { id: 'g24', title: 'Pick-your-own fruit farm', cost: [20, 30], drive: 30, seasons: ['Summer', 'Fall'], energy: 'Med', leans: 'Both', tags: ['outdoors', 'walk'] },
  { id: 'g25', title: 'Corn maze or pumpkin patch', cost: [20, 30], drive: 30, seasons: ['Fall'], energy: 'Med', leans: 'Both', tags: ['outdoors', 'walk', 'holiday'] },
  { id: 'g26', title: 'Sports museum or game', cost: [60, 80], drive: 40, seasons: ['Any'], energy: 'Med', leans: 'Both', tags: ['museum', 'indoors'], special: true },
  { id: 'g27', title: 'Small-town day trip with a diner lunch', cost: [50, 80], drive: 75, seasons: ['Any'], energy: 'Med', leans: 'Both', tags: ['day-trip', 'diner', 'drive'], special: true },
  { id: 'g28', title: 'Scenic train ride', cost: [60, 90], drive: 40, seasons: ['Fall', 'Winter'], energy: 'Low', leans: 'Both', tags: ['drive', 'holiday', 'indoors'], special: true },
  { id: 'g29', title: 'A live show at a local theater', cost: [30, 80], drive: 20, seasons: ['Any'], energy: 'Low', leans: 'Both', tags: ['show', 'indoors'] },
  { id: 'g30', title: 'Matinee movie + early dinner', cost: [30, 45], drive: 18, seasons: ['Any'], energy: 'Low', leans: 'Both', tags: ['show', 'indoors'] },
];
