'use client';

import bosniaDataJson from '../../public/bosnia.json';
import {useCallback, useEffect, useRef, useState} from "react";
import {toast, Toaster} from "react-hot-toast";
import dynamic from "next/dynamic";

const GeoJSON = dynamic(() => import('react-leaflet').then(c => c.GeoJSON), {
	ssr: false
})
const MapContainer = dynamic(() => import('react-leaflet').then(c => c.MapContainer), {
	ssr: false
})


interface FeatureProperties {
	id_2: string;
	name_0: string;
	name_1: string;
	name_2: string;
	name_3: string;
	type_2: string;
	engtype_2: string;
}

interface FeatureData extends FeatureProperties {
	population: number;
	infected: number;
	immune: number;
	dead: number;
	hasDistancing: boolean;
	hasMasks: boolean;
	hasLockdown: boolean;
	hasVaccines: boolean;
}


interface Disease {
	name: string;
	// incubationTime: number;
	immunityTime: number;
	lethality: number;
	requiredVaccines: number;
	spreadChance: number;
}

export default function Home() {
	const [mounted, setMounted] = useState(false);
	const [hoveredCanton, setHoveredCanton] = useState<FeatureProperties | null>(null);
	const [selectedCanton, setSelectedCanton] = useState<FeatureProperties | null>(null);
	const [previousSelectedCanton, setPreviousSelectedCanton] = useState<FeatureProperties | null>(null);
	const [sidebarOpen, setSidebarOpen] = useState(true);
	const startPickRef = useRef<HTMLDivElement>(null);
	const [gameSped, setGameSpeed] = useState(1);
	const cantonDataMemoized = (cantonDataJson as any).features.map((feature: any) => {
		return {
			...feature.properties,
			population: Math.floor(Math.random() * 10000),
			infected: 0,
			immune: 0,
			dead: 0
		}
	});
	const [regions, setRegions] = useState<FeatureData[]>(cantonDataMemoized);
	const [disease, setDisease] = useState<Disease>({
		name: 'COVID-19',
		// incubationTime: 14,
		immunityTime: 365,
		lethality: 0.1,
		requiredVaccines: 2,
		spreadChance: 0.1
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
		if (!previousSelectedCanton) {
			setPreviousSelectedCanton(selectedCanton);
			return;
		}
		const reg = regions.find((region) => region.id_2 === selectedCanton?.id_2)
		if (!reg) return;
		setStartingRegion(reg);
		setStartPickMode(false);
		toast.success(`${disease.name} starts in ${reg.name_2}`, {
			icon: "⚠️"
		});
	}, [previousSelectedCanton, selectedCanton, startPickMode]);


	useEffect(() => {
		setTotalStats({
			population: regions.reduce((acc, region) => acc + region.population, 0),
			infected: regions.reduce((acc, region) => acc + region.infected, 0),
			immune: regions.reduce((acc, region) => acc + region.immune, 0),
			dead: regions.reduce((acc, region) => acc + region.dead, 0)
		})
	}, [regions]);

	// Actual game logic
	const gameLoop = useCallback(() => {
		if (!startingRegion) return;
		const sRegion = regions?.find((region) => region.id_2 === startingRegion.id_2);
		if (sRegion?.infected === 0) {
			setRegions(prev => prev.map((region) => {
				if (region.id_2 === startingRegion.id_2) {
					return {...region, infected: 1};
				}
				return region;
			}));
		}

		const newRegions = regions.map((region, index) => {
			const modifying = region
			if (region.infected / region.population > 0.5) {
				console.log(region.infected / region.population > 0.5, `spreading from ${region.name_2} to ${regions[index - 1]?.name_2} and ${regions[index + 1]?.name_2}`)
				const previousRegion = regions[index - 1];
				const nextRegion = regions[index + 1];
				const previousRegionInfected = previousRegion?.infected ?? 0;
				const nextRegionInfected = nextRegion?.infected ?? 0;
				const previousRegionLockdown = previousRegion?.hasLockdown ?? false;
				const nextRegionLockdown = nextRegion?.hasLockdown ?? false;

				// Spread to previous region, if they have alive, non-immune people that are not infected
				if (previousRegion && previousRegion.dead < previousRegion.population && previousRegion.immune < previousRegion.population && previousRegionInfected < previousRegion.population) {
					// Lockdown reduces spread chance by 90%
					if (previousRegionLockdown) {
						const spreadChance = Math.random();
						if (spreadChance < disease.spreadChance * 0.1) {
							modifying.infected += 1;
						}
					} else {
						const spreadChance = Math.random();
						if (spreadChance < disease.spreadChance) {
							modifying.infected += 1;
						}
					}

				}

				if (nextRegion && nextRegion.dead < nextRegion.population && nextRegion.immune < nextRegion.population && nextRegionInfected < nextRegion.population) {
					// Lockdown reduces spread chance by 90%
					if (nextRegionLockdown) {
						const spreadChance = Math.random();
						if (spreadChance < disease.spreadChance * 0.1) {
							modifying.infected += 1;
						}
					} else {

						const spreadChance = Math.random();
						if (spreadChance < disease.spreadChance) {
							modifying.infected += 1;
						}
					}
				}
			}

			// In-region spreading depends on the following:
			// Social distancing reduces spread chance by 50%
			// Masks reduce spread chance by 50%
			// Lockdown reduces spread chance by 90%
			// We can only spread to people that are alive, non-immune and not infected
			if (region.dead < region.population && region.immune < region.population && region.infected < region.population) {
				let spreadChance = disease.spreadChance;
				if (region.hasDistancing) {
					spreadChance *= 0.5;
				}
				if (region.hasMasks) {
					spreadChance *= 0.5;
				}
				if (region.hasLockdown) {
					spreadChance *= 0.1;
				}
				const spreadChanceRandom = Math.random();
				// spreads between 1.05 and 2 times
				const spreadAmount = Math.floor(Math.random() * 2) + 1;
				if (spreadChanceRandom < spreadChance) {
					modifying.infected += spreadAmount;
				}
			}

			// If we have vaccines, random infected people and non-infected alive people will be immune
			if (region.hasVaccines) {
				const randomInfected = Math.floor(Math.random() * region.infected * 0.2);
				const randomAlive = Math.floor(Math.random() * (region.population - region.dead));

				// we cant have more immune people than total - dead
				if (randomInfected + randomAlive + modifying.immune > modifying.population - modifying.dead) {
					modifying.immune = modifying.population - modifying.dead;
					modifying.infected = 0;
				} else {
					modifying.infected -= randomInfected;
					modifying.immune += randomInfected + randomAlive;
				}

			}

			// Depending on the lethality, random infected people will die
			if (region.infected > 0) {
				const randomInfected = Math.floor(Math.random() * region.infected);
				const randomDead = Math.floor(randomInfected * disease.lethality);

				// we cant have more dead than total
				if (randomDead + modifying.dead > modifying.population) {
					modifying.dead = modifying.population;
					modifying.infected = 0;

				} else {
					modifying.infected -= randomDead;
					modifying.dead += randomDead;
				}


			}


			return modifying;

		});

		setRegions(newRegions);

	}, [startingRegion, regions, disease.spreadChance]);

	useEffect(() => {
		const interval = setInterval(() => {
			gameLoop();
		}, 10);
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
							 hoveredCanton ? 'p-4' : 'p-0'
						 }`}>
						<p className={'text-white font-bold text-lg'}>{hoveredCanton?.name_2}</p>
						<p className={'text-gray-200'}>{hoveredCanton?.name_1}</p>
					</div>
				)
			}
			<div className={'absolute top-0 left-0 right-0 p-4'}>
				<h1 className={'text-2xl text-white font-bold'}>Total stats</h1>
				<div className={'flex flex-col gap-1'}>
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
					data={bosniaDataJson as any}
					onEachFeature={(feature, layer) => {
						layer.on({
							mouseover: (e) => {
								setHoveredCanton(feature.properties);
							},
							mouseout: (e) => {
								setHoveredCanton(null);
							},
							click: (e) => {
								setSelectedCanton(feature.properties);
							},
						});
					}}
					style={(feature) => {
						const region = regions.find((region) => region.id_2 === feature?.properties.id_2);
						return {
							fillColor: (() => {
								if (!region) return '#000000';
								if (region.immune >= region.population - region.dead) return '#0000ff';
								const percentage = region.infected / (region.population - region.immune - region.dead);
								const red = Math.floor(percentage * 255);
								const green = Math.floor((1 - percentage) * 255);
								return `rgb(${red}, ${green}, 0)`;
							})(),
							fillOpacity: (() => {
								if (!region) return 1;
								const percentage = region.dead / region.population;
								return 1 - percentage;
							})(),
							color: (() => {
								if (!region || !startingRegion) return 'gray';
								const percentage = region.immune / (region.population - region.dead)
								const red = Math.floor(percentage * 255);
								const green = Math.floor((0.8 - percentage) * 255);
								return `rgb(${green}, ${red}, 0)`;
							})(),
							weight: "1",
						};
					}}
					// @ts-ignore
					className={'pointer-events-auto'}
				/>
			</MapContainer>

			<div
				className={`absolute flex bottom-0 transition-all px-4 left-0 right-0 bg-neutral-800 ${
					hoveredCanton ? 'py-4' : 'py-0'
				}`}>
				<div className={'flex flex-col w-1/2'}>
					<h1 className={'text-2xl text-white font-bold'}>{hoveredCanton?.name_3}</h1>
					<p className={'text-gray-200'}>{hoveredCanton?.name_2}</p>
				</div>
				<div className={`flex flex-col justify-end items-end transition-all w-1/2 ${
					!sidebarOpen ? 'mr-[500px]' : 'mr-0'
				}`}>
					{
						(() => {
							const region = regions.find((region) => region.id_2 === hoveredCanton?.id_2);
							if (!region) return;

							return (
								<>
									<p className={'text-white'}>{region.population} inhabitants</p>
									<p className={'text-white'}>{region.infected} infected</p>
									<p className={'text-white'}>{region.immune} immune</p>
									<p className={'text-white'}>{region.dead} dead</p>
								</>
							)
						})()
					}
				</div>
			</div>
			<div
				key={selectedCanton?.id_2 ?? 'none'}
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
							<input type="text" className={'bg-neutral-800 rounded-lg text-white p-2'}
								   onChange={(e) => {
									   if (!e.target.value) return;
									   setDisease({...disease, name: e.target.value});
								   }}
								   placeholder={disease.name}
							/>
						</div>
						<div className={'flex flex-col gap-1'}>
							<label htmlFor="disease-immunity-time" className={'text-gray-200'}>Immunity time</label>
							<input type="number" className={'bg-neutral-800 rounded-lg text-white p-2'}
								   onChange={(e) => {
									   if (!e.target.value) return;
									   setDisease({...disease, immunityTime: parseInt(e.target.value)});
								   }
								   }
								   placeholder={disease.immunityTime.toString()}
							/>
						</div>
						<div className={'flex flex-col gap-1'}>
							<label htmlFor="disease-lethality" className={'text-gray-200'}>Lethality</label>
							<input type="number" className={'bg-neutral-800 rounded-lg text-white p-2'}
								   onChange={(e) => {
									   if (!e.target.value) return;
									   setDisease({...disease, lethality: parseInt(e.target.value)});
								   }
								   }
								   placeholder={disease.lethality.toString()}
							/>
						</div>
						<div className={'flex flex-col gap-1'}>
							<label htmlFor="disease-required-vaccines" className={'text-gray-200'}>Required
								vaccines</label>
							<input type="number" className={'bg-neutral-800 rounded-lg text-white p-2'}
								   onChange={(e) => {
									   if (!e.target.value) return;
									   setDisease({...disease, requiredVaccines: parseInt(e.target.value)});
								   }
								   }
								   placeholder={disease.requiredVaccines.toString()}
							/>
						</div>
						<div className={'flex flex-col gap-1'}>
							<label htmlFor="disease-spread-chance" className={'text-gray-200'}>Spread chance</label>
							<input type="number" className={'bg-neutral-800 rounded-lg text-white p-2'}
								   onChange={(e) => {
									   if (!e.target.value) return;
									   setDisease({...disease, spreadChance: parseInt(e.target.value)});
								   }
								   }
								   placeholder={disease.spreadChance.toString()}
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
					<h2 className={'text-xl text-white font-bold mb-1 mt-4'}>Region: {selectedCanton?.name_2 ?? 'None'}</h2>
					{
						selectedCanton && (
							<div className={'flex flex-col gap-4'}>
								<div className={'flex flex-col gap-1'}>
									<label htmlFor="region-population" className={'text-gray-200'}>Population</label>
									<input type="number" className={'bg-neutral-800 rounded-lg text-white p-2'}
										   onChange={(e) => {
											   if (!e.target.value) return;
											   const region = regions.find((region) => region.id_2 === selectedCanton?.id_2);
											   if (!region) return;
											   setRegions(regions.map((region) => {
												   if (region.id_2 === selectedCanton?.id_2) {
													   return {...region, population: parseInt(e.target.value)};
												   }
												   return region;
											   }));
										   }
										   }
										   placeholder={selectedCanton ? regions.find((region) => region.id_2 === selectedCanton?.id_2)?.population.toString() : ''}
									/>
								</div>
								<div className={'flex flex-col gap-1'}>
									<label htmlFor="region-infected" className={'text-gray-200'}>Infected</label>
									<input type="number" className={'bg-neutral-800 rounded-lg text-white p-2'}
										   onChange={(e) => {
											   if (!e.target.value) return;
											   const region = regions.find((region) => region.id_2 === selectedCanton?.id_2);
											   if (!region) return;
											   setRegions(regions.map((region) => {
												   if (region.id_2 === selectedCanton?.id_2) {
													   return {...region, infected: parseInt(e.target.value)};
												   }
												   return region;
											   }));
										   }
										   }
										   placeholder={selectedCanton ? regions.find((region) => region.id_2 === selectedCanton?.id_2)?.infected.toString() : ''}
									/>
								</div>
								<div className={'flex flex-col gap-1'}>
									<label htmlFor="region-immune" className={'text-gray-200'}>Immune</label>
									<input type="number" className={'bg-neutral-800 rounded-lg text-white p-2'}
										   onChange={(e) => {
											   if (!e.target.value) return;
											   const region = regions.find((region) => region.id_2 === selectedCanton?.id_2);
											   if (!region) return;
											   setRegions(regions.map((region) => {
												   if (region.id_2 === selectedCanton?.id_2) {
													   return {...region, immune: parseInt(e.target.value)};
												   }
												   return region;
											   }));
										   }
										   }
										   placeholder={selectedCanton ? regions.find((region) => region.id_2 === selectedCanton?.id_2)?.immune.toString() : ''}
									/>
								</div>
								<div className={'flex flex-col gap-1'}>
									<label htmlFor="region-dead" className={'text-gray-200'}>Dead</label>
									<input type="number" className={'bg-neutral-800 rounded-lg text-white p-2'}
										   onChange={(e) => {
											   if (!e.target.value) return;
											   const region = regions.find((region) => region.id_2 === selectedCanton?.id_2);
											   if (!region) return;
											   setRegions(regions.map((region) => {
												   if (region.id_2 === selectedCanton?.id_2) {
													   return {...region, dead: parseInt(e.target.value)};
												   }
												   return region;
											   }));
										   }
										   }
										   placeholder={selectedCanton ? regions.find((region) => region.id_2 === selectedCanton?.id_2)?.dead.toString() : ''}
									/>
								</div>
								<h3 className={'text-xl text-white font-bold mb-1 mt-4'}>Measures</h3>
								<div className={'inline-flex gap-8'}>
									<label htmlFor="region-has-distancing" className={'text-gray-200'}>Social
										distancing</label>
									<input type="checkbox" className={'bg-neutral-800 rounded-lg text-white p-2'}
										   onChange={(e) => {
											   const region = regions.find((region) => region.id_2 === selectedCanton?.id_2);
											   if (!region) return;
											   setRegions(regions.map((region) => {
												   if (region.id_2 === selectedCanton?.id_2) {
													   return {...region, hasDistancing: e.target.checked};
												   }
												   return region;
											   }));
										   }
										   }
										   checked={selectedCanton ? regions.find((region) => region.id_2 === selectedCanton?.id_2)?.hasDistancing : false}
									/>
								</div>
								<div className={'inline-flex gap-8'}>
									<label htmlFor="region-has-masks" className={'text-gray-200'}>Masks</label>
									<input type="checkbox" className={'bg-neutral-800 rounded-lg text-white p-2'}
										   onChange={(e) => {
											   const region = regions.find((region) => region.id_2 === selectedCanton?.id_2);
											   if (!region) return;
											   setRegions(regions.map((region) => {
												   if (region.id_2 === selectedCanton?.id_2) {
													   return {...region, hasMasks: e.target.checked};
												   }
												   return region;
											   }));
										   }
										   }
										   checked={selectedCanton ? regions.find((region) => region.id_2 === selectedCanton?.id_2)?.hasMasks : false}
									/>
								</div>
								<div className={'inline-flex gap-8'}>
									<label htmlFor="region-has-lockdown" className={'text-gray-200'}>Lockdown</label>
									<input type="checkbox" className={'bg-neutral-800 rounded-lg text-white p-2'}
										   onChange={(e) => {
											   const region = regions.find((region) => region.id_2 === selectedCanton?.id_2);
											   if (!region) return;
											   setRegions(regions.map((region) => {
												   if (region.id_2 === selectedCanton?.id_2) {
													   return {...region, hasLockdown: e.target.checked};
												   }
												   return region;
											   }));
										   }
										   }
										   checked={selectedCanton ? regions.find((region) => region.id_2 === selectedCanton?.id_2)?.hasLockdown : false}
									/>
								</div>
								<div className={'inline-flex gap-8'}>
									<label htmlFor="region-has-vaccines" className={'text-gray-200'}>Vaccines</label>
									<input type="checkbox" className={'bg-neutral-800 rounded-lg text-white p-2'}
										   onChange={(e) => {
											   const region = regions.find((region) => region.id_2 === selectedCanton?.id_2);
											   if (!region) return;
											   setRegions(regions.map((region) => {
												   if (region.id_2 === selectedCanton?.id_2) {
													   return {...region, hasVaccines: e.target.checked};
												   }
												   return region;
											   }));
										   }
										   }
										   checked={selectedCanton ? regions.find((region) => region.id_2 === selectedCanton?.id_2)?.hasVaccines : false}
									/>
								</div>
							</div>
						)
					}
				</div>
			</div>
			<div className={'p-4 absolute top-0 right-0 '}>
				<button onClick={() => setSidebarOpen(!sidebarOpen)} className={'text-white text-2xl font-bold'}>☰
				</button>
			</div>
		</div>
	)
}
