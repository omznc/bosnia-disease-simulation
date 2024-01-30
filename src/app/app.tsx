'use client';

// @ts-nocheck
import regionDataJson from '../../public/bosnia.json';
import {useCallback, useEffect, useMemo, useRef, useState} from "react";
import {toast, Toaster} from "react-hot-toast";
import dynamic from "next/dynamic";
import L from 'leaflet';

// @ts-ignore
import lkk from 'leaflet-knn';

const GeoJSON = dynamic(() => import('react-leaflet').then(c => c.GeoJSON), {
	ssr: false
})
const MapContainer = dynamic(() => import('react-leaflet').then(c => c.MapContainer), {
	ssr: false
})

// pass 4 points to get the center. [lat, lng, lat, lng]
const getCenterFromBounds = (bounds: [number, number, number, number]) => {
	const lat = (bounds[0] + bounds[2]) / 2;
	const lng = (bounds[1] + bounds[3]) / 2;
	return [lng, lat];
}

interface FeatureProperties {
	id_3: string;
	name_0: string;
	name_1: string;
	name_2: string;
	name_3: string;
	type_2: string;
	engtype_2: string;
	longitude: number;
	latitude: number;
}

interface FeatureData extends FeatureProperties {
	people: Person[];
	hasDistancing: boolean;
	hasMasks: boolean;
	hasLockdown: boolean;
	hasVaccines: boolean;
}


interface Disease {
	name: string;
	lethality: number;
	requiredVaccines: number;
	virability: number;
	incubationTime: number; // in seconds
}

interface Person {
	infected: boolean;
	infectedAt: number;
	immune: boolean;
	dead: boolean;
}

// @ts-ignore
export default function Home() {
	const [mounted, setMounted] = useState(false);
	const [hoveredRegion, setHoveredRegion] = useState<FeatureProperties | null>(null);
	const [selectedRegion, setSelectedRegion] = useState<FeatureProperties | null>(null);
	const [previousSelectedRegion, setPreviousSelectedRegion] = useState<FeatureProperties | null>(null);
	const [sidebarOpen, setSidebarOpen] = useState(true);
	const startPickRef = useRef<HTMLDivElement>(null);
	const [elapsedTime, setElapsedTime] = useState(0);

	const regionDataMemoized = (regionDataJson as any).features.map((feature: any) => {
		return {
			...feature.properties,
			people: Array.from({length: Math.floor(Math.random() * 10000)}, () => {
				return {
					infected: false,
					infectedAt: 0,
					immune: false,
					dead: false,
				}
			}),
			longitude: getCenterFromBounds(feature.bbox as any)[1],
			latitude: getCenterFromBounds(feature.bbox as any)[0],
		}
	});
	const [regions, setRegions] = useState<FeatureData[]>(regionDataMemoized);
	const [disease, setDisease] = useState<Disease>({
		name: 'COVID-19',
		lethality: 0.1,
		requiredVaccines: 2,
		virability: 0.1,
		incubationTime: 14,
	});
	const [startPickMode, setStartPickMode] = useState(false);
	const [startingRegion, setStartingRegion] = useState<FeatureData | null>(null);
	const [totalStats, setTotalStats] = useState({
		population: 0,
		infected: 0,
		immune: 0,
		dead: 0
	});

	useEffect(() => {
		setMounted(true);
	}, []);

	useEffect(() => {
		// 	custom cursor if in pick mode
		if (!startPickMode) return;

		document.body.style.cursor = 'crosshair';

		// 	add event listener on mouseMove to have a text above the cursor
		document.addEventListener('mousemove', (e) => {
				if (!startPickRef.current) return;
				startPickRef.current.style.left = `${e.clientX}px`;
				startPickRef.current.style.top = `${e.clientY}px`;
			}
		)

		return () => {
			document.body.style.cursor = 'default';
			document.removeEventListener('mousemove', () => {
			});
		}

	}, [startPickMode]);

	// if in picker mode, the next click while a valid region is hovered will set the starting region
	useEffect(() => {
		if (startingRegion || !startPickMode) return;
		if (!previousSelectedRegion) {
			setPreviousSelectedRegion(selectedRegion);
			return;
		}
		const reg = regions.find((region) => region.id_3 === selectedRegion?.id_3)
		if (!reg) return;
		setStartingRegion(reg);
		setStartPickMode(false);
		toast.success(`${disease.name} starts in ${reg.name_3}`, {
			icon: "⚠️"
		});
	}, [previousSelectedRegion, selectedRegion, startPickMode]);

	const pointIndex = useMemo(() => {
		const gj = L.geoJSON(regionDataJson as any);
		return lkk(gj);
	}, []);


	useEffect(() => {
		setTotalStats({
			// population: regions.reduce((acc, region) => acc + region.population, 0),
			// infected: regions.reduce((acc, region) => acc + region.infected, 0),
			// immune: regions.reduce((acc, region) => acc + region.immune, 0),
			// dead: regions.reduce((acc, region) => acc + region.dead, 0)
		// 	population is the length of all people
			population: regions.reduce((acc, region) => acc + region.people.length, 0),
			infected: regions.reduce((acc, region) => acc + region.people.filter((person) => person.infected).length, 0),
			immune: regions.reduce((acc, region) => acc + region.people.filter((person) => person.immune).length, 0),
			dead: regions.reduce((acc, region) => acc + region.people.filter((person) => person.dead).length, 0)
		})
	}, [regions]);

	const [newSpreads, setNewSpreads] = useState<FeatureData[]>([]); // Initialize newSpreads outside of gameLoop

	const gameLoop = useCallback(() => {
		if (!startingRegion) return;
		const sRegion = regions?.find((region) => region.id_3 === startingRegion.id_3);
		setElapsedTime(elapsedTime + 1);


		const newRegions = regions.map((region, index) => {
			if (region.people.length === 0) return region;
			if (region.people.every((person) => person.dead || person.immune)) return region;

			const newRegion = newSpreads.find((r) => r.id_3 === region.id_3) || region;

			if (sRegion?.id_3 === newRegion?.id_3) {
				newRegion.people[0].infected = true;
				newRegion.people[0].infectedAt = elapsedTime;
			}
			// If there's infected people, spread the disease
			if (newRegion.people.some((person) => person.infected)) {
				// If there's more than 10 infected people, spread the disease to the next currentNum * virability
				console.log(`[${
					newRegion.name_3
				}]Infected: ${newRegion.people.filter((person) => person.infected).length} / ${newRegion.people.length}`)
				if (newRegion.people.filter((person) => person.infected).length >= 10) {
					console.log("More than 10 infected, spreading")
					const newInfected = Math.floor(newRegion.people.filter((person) => person.infected).length * disease.virability);
					console.log(`We'll spread to ${newInfected} people`)
					// Spread the disease to newInfected people
					for (let i = 0; i < newInfected; i++) {
						const randomPerson = newRegion.people.find((person) => !person.infected);
						if (!randomPerson) return region;
						randomPerson.infected = true;
						randomPerson.infectedAt = elapsedTime;
					}
				} else {
					// Spread the disease to 1 person
					console.log("Less than 10 infected, spreading to 1 person")
					const randomPerson = newRegion.people.find((person) => !person.infected);
					console.log(randomPerson)
					if (!randomPerson) return region;
					randomPerson.infected = true;
					randomPerson.infectedAt = elapsedTime;

				}
			}

			// If the current region has more than 10 infected people, spread the disease to the nearest regions
			if (newRegion.people.filter((person) => person.infected).length >= 10) {
				let nearest = pointIndex.nearestLayer([newRegion.longitude, newRegion.latitude], 300);
				// @ts-ignore
				nearest = nearest.map((n) => {
					const reg = regions.find((r) => r.id_3 === n.layer.feature.properties.id_3);
					return reg
				});
				// @ts-ignore
				nearest.forEach((n) => {
					const nearestRegion = regions.find((r) => r.id_3 === n.id_3);
					if (nearestRegion) {
						setNewSpreads((prevSpreads) => [...prevSpreads, {...nearestRegion, people: [...nearestRegion.people, {infected: true, infectedAt: elapsedTime, immune: false, dead: false}]}]);
					}
				});
			}
			// If the incubation time has passed, the person either dies or becomes immune.
			// Immunity chance is 1 - lethality chance
			if (newRegion.people.some((person) => person.infected)) {
				newRegion.people.forEach((person) => {
					if (person.infected && elapsedTime - person.infectedAt >= disease.incubationTime) {
						if (Math.random() > disease.lethality) {
							person.immune = true;
							person.infected = false;
						} else {
							person.dead = true;
							person.infected = false;
						}
					}
				})
			}

			return newRegion;
		});

		setRegions(newRegions);
	}, [startingRegion, regions, newSpreads, pointIndex]);

	useEffect(() => {
		const interval = setInterval(() => {
			gameLoop();
		}, 2000);
		return () => clearInterval(interval);
	}, [gameLoop]);

	if (!mounted) return (
		<div className={'w-screen h-screen flex items-center justify-center'}>
			<h1 className={'text-2xl text-white font-bold'}>Loading...</h1>
		</div>
	)

	return (
		<div className='overflow-hidden w-screen h-screen flex'>
			<Toaster/>
			{
				startPickMode && (
					<div ref={startPickRef}
						 className={`absolute transition-[padding] flex flex-col gap-1 rounded-lg bg-neutral-800 z-10 ${
							 hoveredRegion ? 'p-4' : 'p-0'
						 }`}>
						<p className={'text-white font-bold text-lg'}>{hoveredRegion?.name_3}</p>
						<p className={'text-gray-200'}>{hoveredRegion?.name_2}</p>
					</div>
				)
			}
			<div className={'absolute top-0 left-0 right-0 p-4 z-[10]'}>
				<h1 className={'text-2xl text-white font-bold'}>Total stats</h1>
				<div className={'flex flex-col gap-1'}>
					<p className={'text-white'}>{elapsedTime} days passed</p>
					<p className={'text-white'}>{totalStats.population} inhabitants</p>
					<p className={'text-white'}>{totalStats.infected} infected</p>
					<p className={'text-white'}>{totalStats.immune} immune</p>
					<p className={'text-white'}>{totalStats.dead} dead</p>
				</div>
			</div>
			<MapContainer
				id={'map'}
				center={[43.85, 17.6]} zoom={8} className={'w-screen h-screen'} zoomAnimation={true}
				zoomDelta={0.1} zoomSnap={0.1} zoomControl={true}
				bounceAtZoomLimits={true} wheelPxPerZoomLevel={300}
			>
				<GeoJSON
					data={regionDataJson as any}
					onEachFeature={(feature, layer) => {
						layer.on({
							mouseover: (e) => {
								setHoveredRegion(feature.properties);
							},
							mouseout: (e) => {
								setHoveredRegion(null);
							},
							click: (e) => {
								const center = getCenterFromBounds(feature.bbox as any);
								const featureD: FeatureData = {
									...feature.properties,
									longitude: center[1],
									latitude: center[0],
								}
								setSelectedRegion(featureD);
							},
						});
					}}
					style={(feature) => {
						const region = regions.find((region) => region.id_3 === feature?.properties.id_3);
						return {
							fillColor: (() => {
								if (!region) return '#000000';
								if (region.people.every((person) => person.dead || person.immune)) return '#0000ff';
								const percentage = region.people.filter((person) => person.infected).length / (region.people.length - region.people.filter((person) => person.immune || person.dead).length);

								const red = Math.floor(percentage * 255);
								const green = Math.floor((1 - percentage) * 255);
								return `rgb(${red}, ${green}, 0)`;
							})(),
							fillOpacity: (() => {
								if (!region) return 0.7;
								const percentage = region.people.filter((person) => person.dead).length / region.people.length;
								return 0.7 - percentage;
							})(),
							color: (() => {
								if (!region || !startingRegion) return 'gray';
								const percentage = region.people.filter((person) => person.immune).length / (region.people.length - region.people.filter((person) => person.dead).length);
								const red = Math.floor(percentage * 255);
								const green = Math.floor((0.8 - percentage) * 255);
								return `rgb(${green}, ${red}, 0)`;
							})(),
							weight: 1,
						};
					}}
					// @ts-ignore
					className={'pointer-events-auto'}
				/>
			</MapContainer>

			<div
				className={`absolute flex bottom-0 transition-all px-4 left-0 right-0 bg-neutral-800 ${
					hoveredRegion ? 'py-4' : 'py-0'
				}`}>
				<div className={'flex flex-col w-1/2'}>
					<h1 className={'text-2xl text-white font-bold'}>{hoveredRegion?.name_3}</h1>
					<p className={'text-gray-200'}>{hoveredRegion?.name_2}</p>
				</div>
				<div className={`flex flex-col justify-end items-end transition-all w-1/2 ${
					!sidebarOpen ? 'mr-[500px]' : 'mr-0'
				}`}>
					{
						(() => {
							const region = regions.find((region) => region.id_3 === hoveredRegion?.id_3);
							if (!region) return;

							const stats = {
								population: region.people.length,
								infected: region.people.filter((person) => person.infected).length,
								immune: region.people.filter((person) => person.immune).length,
								dead: region.people.filter((person) => person.dead).length
							}

							return (
								<>
									<p className={'text-white'}>{stats.population} inhabitants</p>
									<p className={'text-white'}>{stats.infected} infected</p>
									<p className={'text-white'}>{stats.immune} immune</p>
									<p className={'text-white'}>{stats.dead} dead</p>
								</>
							)
						})()
					}
				</div>
			</div>
			<div
				key={selectedRegion?.id_3 ?? 'none'}
				className={`absolute overflow-x-visible transition-all overflow-y-auto right-0 top-0 h-full bg-neutral-900 ${
					sidebarOpen ? 'w-0' : 'w-[500px]'
				}`}>
				<div className={'p-4 overflow-x-visible whitespace-nowrap'}>
					<h1 className={'text-2xl text-white text-center font-bold'}>Settings</h1>
					<div className={'border-b border-neutral-700 my-4'}/>
					<h2 className={'text-xl text-white font-bold mb-1'}>Disease: {disease.name}</h2>
					<div className={'flex flex-col gap-4'}>
						<div className={'flex flex-col gap-1'}>
							<label htmlFor="disease-name" className={'text-gray-200'}>Name</label>
							<input type="text" className={'bg-neutral-800 rounded-lg text-white p-2 z-[999999]'}
								   onChange={(e) => {
									   if (!e.target.value) return;
									   setDisease({...disease, name: e.target.value});
								   }}
								   placeholder={disease.name}
							/>
						</div>
						<div className={'flex flex-col gap-1'}>
							<label htmlFor="disease-immunity-time" className={'text-gray-200'}>Incubation time</label>
							<p className={'text-gray-200 text-sm'}>How many days until a person either dies or becomes immune</p>
							<input type="number" className={'bg-neutral-800 rounded-lg text-white p-2'}
								   onChange={(e) => {
									   if (!e.target.value) return;
									   setDisease({...disease, incubationTime: parseInt(e.target.value)});
								   }
								   }
								   placeholder={disease.incubationTime.toString()}
							/>
						</div>
						<div className={'flex flex-col gap-1'}>
							<label htmlFor="disease-lethality" className={'text-gray-200'}>Lethality</label>
							<p className={'text-gray-200 text-sm'}>How many people die after being infected (%)</p>
							<input type="number" className={'bg-neutral-800 rounded-lg text-white p-2'}
								   onChange={(e) => {
									   if (!e.target.value) return;
									   if (parseInt(e.target.value) > 1) e.target.value = '1';
									   if (parseInt(e.target.value) < 0) e.target.value = '0';
									   setDisease({...disease, lethality: parseFloat(e.target.value)});
								   }
								   }
								   placeholder={disease.lethality.toString()}
							/>
						</div>
						<div className={'flex flex-col gap-1'}>
							<label htmlFor="disease-virability" className={'text-gray-200'}>Virability</label>
							<p className={'text-gray-200 text-sm'}>How likely is it to spread (%)</p>
							<input type="number" className={'bg-neutral-800 rounded-lg text-white p-2'}
								   onChange={(e) => {
									   if (!e.target.value) return;
									   if (parseInt(e.target.value) > 1) e.target.value = '1';
									   if (parseInt(e.target.value) < 0) e.target.value = '0';
									   setDisease({...disease, virability: parseFloat(e.target.value)});
								   }
								   }
								   placeholder={disease.virability.toString()}
								   min={0}
								   max={1}
							/>
						</div>
						{!startingRegion && (
							<button className={'bg-green-500 text-white rounded-lg p-2'} onClick={() => {
								setStartPickMode(!startPickMode);
							}}>
								{startPickMode ? 'Cancel' : 'Pick starting region'}
							</button>
						)}


					</div>
					<h2 className={'text-xl text-white font-bold mb-1 mt-4'}>Region: {selectedRegion?.name_3 ?? 'None'}</h2>
					{
						selectedRegion && (
							<div className={'flex flex-col gap-4'}>
								<div className={'flex flex-col gap-1'}>
									<label htmlFor="region-population" className={'text-gray-200'}>Population</label>
									<input type="number" className={'bg-neutral-800 rounded-lg text-white p-2'}
										   onChange={(e) => {
											   if (!e.target.value) return;
											   const region = regions.find((region) => region.id_3 === selectedRegion?.id_3);
											   if (!region) return;
											   setRegions(regions.map((region) => {
												   if (region.id_3 === selectedRegion?.id_3) {
													   return {...region, population: parseInt(e.target.value)};
												   }
												   return region;
											   }));
										   }
										   }
											placeholder={selectedRegion ? regions.find((region) => region.id_3 === selectedRegion?.id_3)?.people.length.toString() : ''}
									/>
								</div>
								<div className={'flex flex-col gap-1'}>
									<label htmlFor="region-infected" className={'text-gray-200'}>Infected</label>
									<input type="number" className={'bg-neutral-800 rounded-lg text-white p-2'}
										   onChange={(e) => {
											   if (!e.target.value) return;
											   const region = regions.find((region) => region.id_3 === selectedRegion?.id_3);
											   if (!region) return;
											   setRegions(regions.map((region) => {
												   if (region.id_3 === selectedRegion?.id_3) {
													   return {...region, infected: parseInt(e.target.value)};
												   }
												   return region;
											   }));
										   }
										   }
											placeholder={selectedRegion ? regions.find((region) => region.id_3 === selectedRegion?.id_3)?.people.filter((person) => person.infected).length.toString() : ''}
									/>
								</div>
								<div className={'flex flex-col gap-1'}>
									<label htmlFor="region-immune" className={'text-gray-200'}>Immune</label>
									<input type="number" className={'bg-neutral-800 rounded-lg text-white p-2'}
										   onChange={(e) => {
											   if (!e.target.value) return;
											   const region = regions.find((region) => region.id_3 === selectedRegion?.id_3);
											   if (!region) return;
											   setRegions(regions.map((region) => {
												   if (region.id_3 === selectedRegion?.id_3) {
													   return {...region, immune: parseInt(e.target.value)};
												   }
												   return region;
											   }));
										   }
										   }
											placeholder={selectedRegion ? regions.find((region) => region.id_3 === selectedRegion?.id_3)?.people.filter((person) => person.immune).length.toString() : ''}
									/>
								</div>
								<div className={'flex flex-col gap-1'}>
									<label htmlFor="region-dead" className={'text-gray-200'}>Dead</label>
									<input type="number" className={'bg-neutral-800 rounded-lg text-white p-2'}
										   onChange={(e) => {
											   if (!e.target.value) return;
											   const region = regions.find((region) => region.id_3 === selectedRegion?.id_3);
											   if (!region) return;
											   setRegions(regions.map((region) => {
												   if (region.id_3 === selectedRegion?.id_3) {
													   return {...region, dead: parseInt(e.target.value)};
												   }
												   return region;
											   }));
										   }
										   }
											placeholder={selectedRegion ? regions.find((region) => region.id_3 === selectedRegion?.id_3)?.people.filter((person) => person.dead).length.toString() : ''}
									/>
								</div>
							</div>
						)
					}
				</div>
			</div>
			<div className={'p-4 absolute top-0 right-0 z-[9999]'}>
				<button onClick={() => setSidebarOpen(!sidebarOpen)} className={'text-white text-2xl font-bold'}>☰
				</button>
			</div>
		</div>
	)
}
